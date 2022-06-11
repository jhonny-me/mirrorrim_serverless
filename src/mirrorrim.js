"use strict";
const { Client } = require("pg");
const axios = require('axios').default;

const client = new Client({
  connectionString: process.env.PG_CONNECT_STRING,
});

/**
 * 初始化数据库和表结构
 */
const initDB = async () => {
  const isConnected = client && client._connected;

  if (!isConnected) {
    await client.connect();

    await client.query(`
    CREATE TABLE IF NOT EXISTS user (
      ID              SERIAL          NOT NULL,
      "access_token"  VARCHAR         NOT NULL,
      "refresh_token" VARCHAR         NOT NULL,
      "user_id"       VARCHAR         NOT NULL,
      "expires_at"    TIMESTAMP       NOT NULL
    );`);
  }
};

const addUserInDB = async (user) => {
  const { access_token, refresh_token, user_id, expires_in } = user;
  var date = new Date();
  date.setSeconds(date.getSeconds() + expires_in);

  await initDB();
  // TODO: check if user_id already exists
  const { rowCount } = await client.query({
    text: "INSERT INTO user (access_token, refresh_token, user_id, expires_at) VALUES($1, $2, $3, $4)",
    values: [access_token, refresh_token, user_id, date]
  });

  return rowCount == 1;
}

const updateUserInDB = async (user) => {
  const { access_token, refresh_token, user_id, expires_in } = user;
  var date = new Date();
  date.setSeconds(date.getSeconds() + expires_in);

  await initDB();
  const { rowCount } = await client.query({
    text: "UPDATE user SET access_token = $1, expires_at = $2 WHERE user_id = $3",
    values: [access_token, date, user_id],
  });

  return rowCount == 1;
}

const retriveUserInDB = async (id) => {
  await initDB();

  const { rows } = await client.query({ 
    text: "SELECT * FROM user WHERE user_id = $1 LIMIT 1",
    values: [id],
  });

  if (rows && rows[0]) {
    return rows[0]
  } else {
    return
  }
}

const renewTokenIfNecessary = async (user) => {
  const { access_token, refresh_token, date } = user;
  if (new Date() > date) {
    // access_token expired
    const url = `https://docs.qq.com/oauth/v2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}grant_type=refresh_token&refresh_token=${refresh_token}`
    const response = await axios.get(url);
    const result = await updateUserInDB(response);
    if (result) {
      return response;
    } else {
      throw new Error("Failed to update Datebase");
    }
  } else {
    return user;
  }
}

// callback to accept code from Tencent
exports.fire = async (event, context) => {
   // async 需要关闭事件循环等待，以避免日志记录超时或函数无返回的问题。
  context.callbackWaitsForEmptyEventLoop = false;
  const { code, state } = event.queryStringParameters;
  if (state !== process.env.RSF_STATE) {
    return {
      statusCode: 400,
      message: "Who are you?",
    };
  }
  const { CLIENT_ID, CLIENT_SECRET } = process.env;
  const redirect_uri = encodeURI("https://service-2slh95tv-1301772291.sh.apigw.tencentcs.com/fire")
  const url = `https://docs.qq.com/oauth/v2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&redirect_uri=${redirect_uri}&grant_type=authorization_code&code=${code}`
  const user = await axios.get(url);
  const result = await updateUserInDB(user);

  return result 
    ? {
      statusCode: 201,
      message: `Update your package.json with this token: ${user_id}`
    } : {
      statusCode: 400,
      message: "Failed to login"
    }
}

exports.queryExportProgress = async (event, context) => {
  // async 需要关闭事件循环等待，以避免日志记录超时或函数无返回的问题。
  context.callbackWaitsForEmptyEventLoop = false;
  const { doc_id, operationID, token } = event.queryStringParameters;

  const user = retriveUserInDB(token);
  const { access_token, user_id } = renewTokenIfNecessary(user);

  const url = `https://docs.qq.com/openapi/drive/v2/files/${doc_id}/export-progress?operationID=${operationID}`;
  const { data } = await axios.get(url, {
    headers: {
      "Access-Token": access_token,
      "Client-Id": process.env.CLIENT_ID,
      "Open-Id": user_id,
    }
  });

  return {
    statusCode: 201,
    data
  };
}

// download tencent doc with doc Id and user_id
exports.asyncExport = async (event, context) => {
  // async 需要关闭事件循环等待，以避免日志记录超时或函数无返回的问题。
  context.callbackWaitsForEmptyEventLoop = false;
  const { doc_id, token } = event.queryStringParameters;

  const user = retriveUserInDB(token);
  const { access_token, user_id } = renewTokenIfNecessary(user);
  const url = `https://docs.qq.com/openapi/drive/v2/files/${doc_id}/async-export`;
  const { data } = await axios.post(url, { exportType: "sheet" }, {
    headers: {
      "Access-Token": access_token,
      "Client-Id": process.env.CLIENT_ID,
      "Open-Id": user_id,
      "Content-Type": "application/x-www-form-urlencoded",
    }
  });

  return {
    statusCode: 200,
    data
  };
}


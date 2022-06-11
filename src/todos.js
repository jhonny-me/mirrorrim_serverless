"use strict";
const { Client } = require("pg");

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

/**
 * 获取所有Todo事项
 */
exports.all = async (event, context) => {
  // async 需要关闭事件循环等待，以避免日志记录超时或函数无返回的问题。
  context.callbackWaitsForEmptyEventLoop = false;
  await initDB();

  const { rows } = await client.query({ text: "SELECT * FROM user" });

  return {
    message: "Tencent SCF execute successful!",
    data: rows,
  };
};

/**
 * 添加新的Todo事项
 */
exports.add = async (event, context) => {
  // async 需要关闭事件循环等待，以避免日志记录超时或函数无返回的问题。
  context.callbackWaitsForEmptyEventLoop = false;
  const { title, note } = JSON.parse(event.body);
  if (!title) {
    return {
      statusCode: 400,
      message: "Missing Todo Title",
    };
  }

  await initDB();
  const { rowCount } = await client.query({
    text: "INSERT INTO user (title, note) VALUES($1, $2)",
    values: [title, note],
  });

  return rowCount === 1
    ? {
        statusCode: 201,
        message: "Todo added success.",
      }
    : {
        statusCode: 400,
        message: "Todo added failed.",
      };
};

/**
 * 完成指定Todo事项
 */
exports.comp = async (event, context) => {
  // async 需要关闭事件循环等待，以避免日志记录超时或函数无返回的问题。
  context.callbackWaitsForEmptyEventLoop = false;
  const todoId = event.pathParameters.id;

  if (!todoId && !isNaN(todoId)) {
    return {
      statusCode: 400,
      message: "Missing Todo Id",
    };
  }

  await initDB();
  const { rowCount } = await client.query({
    text: "UPDATE user SET is_complete = true WHERE id=$1",
    values: [todoId],
  });

  return rowCount === 1
    ? {
        statusCode: 200,
        message: "Todo Complete success.",
      }
    : {
        statusCode: 400,
        message: "Todo Complete failed.",
      };
};

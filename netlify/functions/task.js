const jwt   = require("jsonwebtoken");
const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));

// — API 키 & JWT 생성 함수 (기존 방식 그대로)
const ACCESS_KEY = process.env.ACCESS_KEY || 'YOUR_ACCESS_KEY';
const SECRET_KEY = process.env.SECRET_KEY || 'YOUR_SECRET_KEY';
function makeJwt() {
  try {
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign(
      { iss: ACCESS_KEY, exp: now + 1800, nbf: now - 5 },
      SECRET_KEY,
      { algorithm: "HS256" }
    );
  } catch (e) {
    console.error("JWT 생성 오류:", e);
    return null;
  }
}

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: "Method Not Allowed",
    };
  }

  // 1) JWT 생성
  const token = makeJwt();
  if (!token) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: "JWT 생성 실패",
    };
  }

  // 2) task_id 확인
  const id = event.queryStringParameters?.id;
  if (!id) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: "id param required",
    };
  }

  // 3) Kling API task 조회
  try {
    const resp = await fetch(
      `https://api.klingai.com/v1/images/kolors-virtual-try-on/${id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const api  = await resp.json();
    const data = api.data || api;

    // 이미지 URL 표준화
    const imageUrl =
      data.image_url ||
      data.result_url ||
      data.task_result?.images?.[0]?.url ||
      null;

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        task_id:     data.task_id || id,
        task_status: data.task_status || data.status,
        image_url:   imageUrl,
      }),
    };
  } catch (e) {
    console.error("Task 조회 오류:", e);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: e.message,
    };
  }
};

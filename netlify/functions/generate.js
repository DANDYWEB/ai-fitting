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
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
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

  // 2) Request body 파싱
  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: "Invalid JSON",
    };
  }
  const { human_image, cloth_image } = payload;
  if (!human_image || !cloth_image) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: "Missing images",
    };
  }

  // 3) Kling API 호출
  try {
    const resp = await fetch(
      "https://api.klingai.com/v1/images/kolors-virtual-try-on",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          model_name: "kolors-virtual-try-on-v1-5",
          human_image,
          cloth_image,
        }),
      }
    );
    const j = await resp.json();

    return {
      statusCode: resp.ok ? 200 : resp.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify(j.data || j),
    };
  } catch (e) {
    console.error("Kling API 호출 오류:", e);
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: e.message,
    };
  }
};

const jwt   = require("jsonwebtoken");
const fetch = (...args) => import("node-fetch").then(({default:f})=>f(...args));

const AK = process.env.ACCESS_KEY;
const SK = process.env.SECRET_KEY;

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
      body: ""
    };
  }

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: "Method Not Allowed"
    };
  }

  const id = event.queryStringParameters?.id;
  if (!id) {
    return {
      statusCode: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: "id param required"
    };
  }

  const token = jwt.sign(
    { iss: AK, exp: Math.floor(Date.now()/1000)+1800 },
    SK, { algorithm: "HS256" }
  );

  const resp = await fetch(
    `https://api.klingai.com/v1/images/kolors-virtual-try-on/${id}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const api  = await resp.json();
  const data = api.data || api;

  // 표준화된 URL 추출
  const imageUrl =
       data.image_url
    || data.result_url
    || data.task_result?.images?.[0]?.url
    || null;

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({
      task_status: data.task_status || data.status,
      image_url: imageUrl,
      raw: data
    })
  };
};

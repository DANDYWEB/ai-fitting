const jwt   = require("jsonwebtoken");
const fetch = (...args) => import("node-fetch").then(({default:f})=>f(...args));

const AK  = process.env.ACCESS_KEY;
const SK  = process.env.SECRET_KEY;
const URL = "https://api.klingai.com/v1/images/kolors-virtual-try-on";

exports.handler = async (event) => {
  // 1) CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
      body: ""
    };
  }

  // 2) 실제 POST 처리
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: "Method Not Allowed"
    };
  }

  try {
    const { human_image, cloth_image } = JSON.parse(event.body || "{}");
    if (!human_image || !cloth_image) {
      return {
        statusCode: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
        body: "Missing images"
      };
    }

    const now   = Math.floor(Date.now()/1000);
    const token = jwt.sign(
      { iss: AK, exp: now+1800, nbf: now-5 },
      SK,
      { algorithm: "HS256" }
    );

    const r = await fetch(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ model_name:"kolors-virtual-try-on-v1-5", human_image, cloth_image })
    });
    const j = await r.json();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify(j.data)
    };

  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      body: e.message
    };
  }
};

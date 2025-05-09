/*
  GET /.netlify/functions/task?id=TASK_ID
    → Kling 작업 상태 조회 + 이미지 URL 표준화
*/
const jwt = require("jsonwebtoken");
const fetch = (...a) =>
  import("node-fetch").then(({ default: f }) => f(...a));

const AK = process.env.ACCESS_KEY;
const SK = process.env.SECRET_KEY;

exports.handler = async (event) => {
  const id = event.queryStringParameters.id;
  if (!id) return { statusCode: 400, body: "id param required" };

  /* JWT */
  const token = jwt.sign(
    { iss: AK, exp: Math.floor(Date.now() / 1000) + 1800 },
    SK,
    { algorithm: "HS256" }
  );

  /* Kling Task 조회 */
  const resp = await fetch(
    `https://api.klingai.com/v1/images/kolors-virtual-try-on/${id}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const api = await resp.json();
  const data = api.data || api;

  /* ── 이미지 URL 표준화 ── */
  const imageUrl =
    data.result_url ||
    data.image_url ||
    data.task_result?.result_url ||
    data.task_result?.images?.[0]?.url ||
    null;

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      task_status: data.task_status || data.status,
      image_url: imageUrl,
      created_at: data.created_at,
      updated_at: data.updated_at,
    }),
  };
};

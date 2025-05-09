/* 서버리스: GET /task?id=xxx ─ Kling 작업 조회 */
const jwt   = require("jsonwebtoken");
const fetch = (...a) => import("node-fetch").then(({default:f}) => f(...a));

const AK = process.env.ACCESS_KEY;
const SK = process.env.SECRET_KEY;

exports.handler = async (event) => {
  const id = event.queryStringParameters.id;
  if (!id) return { statusCode: 400, body: "id param required" };

  const token = jwt.sign(
    { iss: AK, exp: Math.floor(Date.now()/1000)+1800 },
    SK, { algorithm: "HS256" }
  );

  const r = await fetch(
    `https://api.klingai.com/v1/images/kolors-virtual-try-on/${id}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const j = await r.json();

  return {
    statusCode: 200,
    headers   : { "Content-Type": "application/json" },
    body      : JSON.stringify(j.data)    // status · task_result …
  };
};

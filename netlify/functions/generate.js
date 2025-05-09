console.log("ACCESS_KEY=", process.env.ACCESS_KEY, "SECRET_KEY=", process.env.SECRET_KEY);

const jwt = require("jsonwebtoken");
const fetch = (...a) => import("node-fetch").then(({ default: f }) => f(...a));

const AK = process.env.ACCESS_KEY;
const SK = process.env.SECRET_KEY;
const URL =
  "https://api.klingai.com/v1/images/kolors-virtual-try-on";

exports.handler = async (event) => {
  if (event.httpMethod !== "POST")
    return { statusCode: 405, body: "Method Not Allowed" };

  try {
    const { human_image, cloth_image } = JSON.parse(event.body || "{}");
    if (!human_image || !cloth_image)
      return { statusCode: 400, body: "Missing images" };

    const now = Math.floor(Date.now() / 1000);
    const token = jwt.sign(
      { iss: AK, exp: now + 1800, nbf: now - 5 },
      SK,
      { algorithm: "HS256" }
    );

    const r = await fetch(URL, {
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
    });
    const j = await r.json();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(j.data), // { task_id, task_status … }
    };
  } catch (e) {
    return { statusCode: 500, body: e.message };
  }
};

export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(
      "SELECT * FROM news ORDER BY id DESC"
    ).all();

    return Response.json({ success: true, news: results });
  } catch (error) {
    return Response.json({
      success: false,
      message: "تعذر جلب الأخبار"
    }, { status: 500 });
  }
}

export async function onRequestGet({ env }) {
  try {
    const result = await env.DB.prepare("SELECT 1 AS connected").first();

    return Response.json({
      success: true,
      database: result?.connected === 1 ? "connected" : "error",
      message: "تم الاتصال بقاعدة البيانات بنجاح"
    });
  } catch (error) {
    return Response.json({
      success: false,
      message: "تعذر الاتصال بقاعدة البيانات"
    }, { status: 500 });
  }
}

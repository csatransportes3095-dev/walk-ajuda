import { createConnection } from "mysql2/promise";

const ORDER_NUMBER = 2080000;
const ORIGINAL_TOTAL = 600;
const COUPON_CODE = "DSC8200";
const COUPON_DISCOUNT = 200;

async function run() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL ausente");
  const db = await createConnection(process.env.DATABASE_URL);
  try {
    const [rows] = await db.query<any[]>(
      "SELECT registrationId FROM orderStatusHistory WHERE orderNumber = ? ORDER BY id DESC LIMIT 1",
      [ORDER_NUMBER],
    );
    if (!rows.length) {
      console.log("[coupon-backfill-2080000] pedido nao encontrado; nenhuma alteracao");
      return;
    }
    const registrationId = Number(rows[0].registrationId);
    const [result] = await db.query<any>(
      `UPDATE accessCodePhones
       SET cartTotal = COALESCE(cartTotal, ?),
           cartCouponCode = COALESCE(NULLIF(cartCouponCode, ''), ?),
           cartCouponDiscount = COALESCE(cartCouponDiscount, ?)
       WHERE id = ?`,
      [ORIGINAL_TOTAL, COUPON_CODE, COUPON_DISCOUNT, registrationId],
    );
    console.log("[coupon-backfill-2080000]", JSON.stringify({
      orderNumber: ORDER_NUMBER,
      registrationId,
      affectedRows: Number(result?.affectedRows || 0),
      originalTotal: ORIGINAL_TOTAL,
      couponCode: COUPON_CODE,
      couponDiscount: COUPON_DISCOUNT,
      finalTotal: ORIGINAL_TOTAL - COUPON_DISCOUNT,
    }));
  } finally {
    await db.end();
  }
}

run().then(() => process.exit(0)).catch((error) => {
  console.error("[coupon-backfill-2080000] FAILED", error instanceof Error ? error.message : error);
  process.exit(1);
});

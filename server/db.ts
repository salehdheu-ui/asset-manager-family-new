import "./env";
import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const rootDb = drizzle(pool, { schema });

type DbHandle = typeof rootDb;

// المعاملة الجارية للطلب الحالي. AsyncLocalStorage يمرّرها عبر سلسلة await
// كاملة دون تمريرها يدوياً بين الدوال، فيبقى توقيع كل دالة تخزين كما هو.
const activeTransaction = new AsyncLocalStorage<DbHandle>();

// كل استعلام يمر من هنا: إن كانت هناك معاملة جارية استُخدمت، وإلا فالاتصال العادي.
// الربط بـ active وليس بالوسيط مقصود — دوال drizzle تعتمد على حقول خاصة
// لا يمكن قراءتها إلا من الكائن الأصلي.
export const db: DbHandle = new Proxy(rootDb, {
  get(target, prop) {
    const active = (activeTransaction.getStore() ?? target) as any;
    const value = Reflect.get(active, prop, active);
    return typeof value === "function" ? value.bind(active) : value;
  },
}) as DbHandle;

/**
 * ينفّذ عملية مالية متعددة الخطوات كوحدة واحدة: إمّا تنجح كلها أو لا يُكتب شيء.
 *
 * بدون هذا، انقطاعٌ في منتصف اعتماد سلفة (انهيار، إعادة نشر، خطأ شبكة) يترك
 * السلفة معتمدة بلا أقساط وبلا إعادة توازن لرأس المال — أي بيانات مالية ناقصة
 * لا يكشفها شيء لاحقاً. لا يحذف هذا الغلاف أي بيانات؛ كل ما يفعله أنه يمنع
 * كتابة نصف عملية.
 *
 * النداءات المتداخلة تنضم للمعاملة الخارجية بدل فتح واحدة جديدة.
 */
export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (activeTransaction.getStore()) {
    return fn();
  }
  return rootDb.transaction((tx) =>
    activeTransaction.run(tx as unknown as DbHandle, fn),
  );
}

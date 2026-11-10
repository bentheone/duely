import mongoose from 'mongoose';

/** Cached Mongoose connection on globalThis so warm serverless invocations reuse it (§3.4). */
const g = globalThis as unknown as { __duelyMongo?: Promise<typeof mongoose> };

export function connectMongo(uri: string): Promise<typeof mongoose> {
  if (!g.__duelyMongo) {
    mongoose.set('strictQuery', true);
    g.__duelyMongo = mongoose
      .connect(uri, { bufferCommands: false, maxPoolSize: 5, serverSelectionTimeoutMS: 8000 })
      .catch((err) => {
        g.__duelyMongo = undefined;
        throw err;
      });
  }
  return g.__duelyMongo;
}

export async function disconnectMongo(): Promise<void> {
  if (g.__duelyMongo) {
    await mongoose.disconnect();
    g.__duelyMongo = undefined;
  }
}

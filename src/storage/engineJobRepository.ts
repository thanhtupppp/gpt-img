import type { EngineJob } from "../engine/types";
import { openDatabase, requestResult, transactionComplete } from "./database";

export async function listEngineJobs(): Promise<EngineJob[]> {
  const database = await openDatabase();
  const transaction = database.transaction("engineJobs", "readonly");
  const result = await requestResult(transaction.objectStore("engineJobs").getAll()) as EngineJob[];
  await transactionComplete(transaction);
  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getEngineJob(id: string): Promise<EngineJob | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction("engineJobs", "readonly");
  const result = await requestResult(transaction.objectStore("engineJobs").get(id)) as EngineJob | undefined;
  await transactionComplete(transaction);
  return result;
}

export async function saveEngineJob(job: EngineJob): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction("engineJobs", "readwrite");
  transaction.objectStore("engineJobs").put(job);
  await transactionComplete(transaction);
}

export async function deleteEngineJob(id: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction("engineJobs", "readwrite");
  transaction.objectStore("engineJobs").delete(id);
  await transactionComplete(transaction);
}

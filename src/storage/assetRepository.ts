import { openDatabase, requestResult, transactionComplete } from "./database";

export type AssetMimeType = "image/png" | "image/jpeg" | "image/webp";
export type AssetSource = "upload" | "workflow";

export interface AssetMetadata {
  id: string;
  name: string;
  mimeType: AssetMimeType;
  size: number;
  source: AssetSource;
  graphId?: string;
  nodeId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredAsset extends AssetMetadata {
  blob: Blob;
}

export interface CreateAssetInput {
  name: string;
  blob: Blob;
  source: AssetSource;
  graphId?: string;
  nodeId?: string;
}

export const MAX_ASSET_SIZE_BYTES = 25 * 1024 * 1024;
const SUPPORTED_MIME_TYPES = new Set<AssetMimeType>(["image/png", "image/jpeg", "image/webp"]);

function validateInput(input: CreateAssetInput): string {
  const name = input.name.trim();
  if (!name) throw new Error("Asset name is required.");
  if (!(input.blob instanceof Blob) || input.blob.size === 0) throw new Error("Asset image is empty or invalid.");
  if (!SUPPORTED_MIME_TYPES.has(input.blob.type as AssetMimeType)) {
    throw new Error("Only PNG, JPEG, and WebP assets are supported.");
  }
  if (input.blob.size > MAX_ASSET_SIZE_BYTES) throw new Error("Asset exceeds the 25 MB limit.");
  if (input.source !== "upload" && input.source !== "workflow") throw new Error("Invalid asset source.");
  if (input.source === "workflow" && (!input.graphId?.trim() || !input.nodeId?.trim())) {
    throw new Error("Workflow assets require both graphId and nodeId.");
  }
  if (input.source === "upload" && (input.graphId || input.nodeId)) {
    throw new Error("Uploaded assets cannot include workflow execution references.");
  }
  return name;
}

function toMetadata(asset: StoredAsset): AssetMetadata {
  return {
    id: asset.id,
    name: asset.name,
    mimeType: asset.mimeType,
    size: asset.size,
    source: asset.source,
    ...(asset.graphId ? { graphId: asset.graphId } : {}),
    ...(asset.nodeId ? { nodeId: asset.nodeId } : {}),
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}

/** Stores durable image bytes separately from graph execution history. */
export async function createAsset(input: CreateAssetInput): Promise<AssetMetadata> {
  const name = validateInput(input);
  const now = new Date().toISOString();
  const asset: StoredAsset = {
    id: crypto.randomUUID(),
    name,
    mimeType: input.blob.type as AssetMimeType,
    size: input.blob.size,
    source: input.source,
    ...(input.source === "workflow" ? { graphId: input.graphId!.trim(), nodeId: input.nodeId!.trim() } : {}),
    createdAt: now,
    updatedAt: now,
    blob: input.blob,
  };
  const database = await openDatabase();
  const transaction = database.transaction("assets", "readwrite");
  transaction.objectStore("assets").add(asset);
  await transactionComplete(transaction);
  return toMetadata(asset);
}

export async function getAsset(id: string): Promise<StoredAsset | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction("assets", "readonly");
  const result = await requestResult(transaction.objectStore("assets").get(id)) as StoredAsset | undefined;
  await transactionComplete(transaction);
  return result;
}

/** Lists metadata only; callers must explicitly load an asset to access its Blob. */
export async function listAssets(): Promise<AssetMetadata[]> {
  const database = await openDatabase();
  const transaction = database.transaction("assets", "readonly");
  const records = await requestResult(transaction.objectStore("assets").getAll()) as StoredAsset[];
  await transactionComplete(transaction);
  return records.map(toMetadata).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function deleteAsset(id: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction("assets", "readwrite");
  transaction.objectStore("assets").delete(id);
  await transactionComplete(transaction);
}

import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { closeDatabaseForTests } from "./database";
import { createAsset, deleteAsset, getAsset, listAssets, MAX_ASSET_SIZE_BYTES } from "./assetRepository";

afterEach(async () => {
  await closeDatabaseForTests();
  indexedDB.deleteDatabase("piecs-library");
});

const png = (size = 4) => new Blob([new Uint8Array(size)], { type: "image/png" });

describe("asset repository", () => {
  it("stores image bytes and returns metadata-only listings", async () => {
    const metadata = await createAsset({ name: "  Product photo  ", blob: png(), source: "upload" });
    expect(metadata.name).toBe("Product photo");
    expect(metadata.mimeType).toBe("image/png");
    expect(metadata.size).toBe(4);
    expect(metadata.source).toBe("upload");
    expect("blob" in metadata).toBe(false);

    const stored = await getAsset(metadata.id);
    expect(stored?.blob.size).toBe(4);
    expect(stored?.blob.type).toBe("image/png");
    expect((await listAssets()).map((asset) => asset.id)).toEqual([metadata.id]);
  });

  it("associates workflow assets with both graph and node identifiers", async () => {
    const metadata = await createAsset({
      name: "Generated output",
      blob: png(),
      source: "workflow",
      graphId: "graph-1",
      nodeId: "node-2",
    });
    expect(metadata.graphId).toBe("graph-1");
    expect(metadata.nodeId).toBe("node-2");
  });

  it("rejects empty names, unsupported MIME types, oversized files, and incomplete workflow references", async () => {
    await expect(createAsset({ name: " ", blob: png(), source: "upload" })).rejects.toThrow("name is required");
    await expect(createAsset({ name: "GIF", blob: new Blob(["gif"], { type: "image/gif" }), source: "upload" })).rejects.toThrow("Only PNG");
    await expect(createAsset({ name: "Large", blob: png(MAX_ASSET_SIZE_BYTES + 1), source: "upload" })).rejects.toThrow("25 MB");
    await expect(createAsset({ name: "Workflow", blob: png(), source: "workflow", graphId: "graph-1" })).rejects.toThrow("both graphId and nodeId");
  });

  it("deletes an asset and its stored image bytes", async () => {
    const metadata = await createAsset({ name: "Temporary", blob: png(), source: "upload" });
    await deleteAsset(metadata.id);
    expect(await getAsset(metadata.id)).toBeUndefined();
    expect(await listAssets()).toEqual([]);
  });
});

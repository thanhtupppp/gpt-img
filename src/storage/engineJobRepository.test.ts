import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { createEngineJob } from "../engine/runtime";
import { closeDatabaseForTests } from "./database";
import { deleteEngineJob, getEngineJob, listEngineJobs, saveEngineJob } from "./engineJobRepository";

const workflow = { id: "workflow-1", name: "Test workflow", steps: [{ id: "step-1", commandId: "analyze", parameters: {} }] };

afterEach(async () => {
  await closeDatabaseForTests();
  indexedDB.deleteDatabase("piecs-library");
});

describe("engine job repository", () => {
  it("persists and sorts local job history", async () => {
    const first = createEngineJob(workflow, "job-1");
    const second = { ...createEngineJob(workflow, "job-2"), createdAt: "2099-01-01T00:00:00.000Z" };
    await saveEngineJob(first);
    await saveEngineJob(second);
    expect((await listEngineJobs()).map((job) => job.id)).toEqual(["job-2", "job-1"]);
    expect(await getEngineJob("job-1")).toEqual(first);
  });

  it("updates and deletes a job", async () => {
    const job = createEngineJob(workflow, "job-1");
    await saveEngineJob(job);
    await saveEngineJob({ ...job, status: "succeeded", progress: 100 });
    expect((await getEngineJob(job.id))?.status).toBe("succeeded");
    await deleteEngineJob(job.id);
    expect(await getEngineJob(job.id)).toBeUndefined();
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

const originalSecret = process.env.SESSION_SECRET;
const originalPassword = process.env.APP_PASSWORD;
afterEach(() => { process.env.SESSION_SECRET = originalSecret; process.env.APP_PASSWORD = originalPassword; });

describe("authentication proxy", () => {
  it("fails closed outside production when authentication is not configured", async () => {
    delete process.env.SESSION_SECRET; delete process.env.APP_PASSWORD;
    const response = await proxy(new NextRequest("http://localhost/vacatures"));
    expect(response.status).toBe(503);
  });
});

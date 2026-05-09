import { expect, test } from "bun:test";
import { HttpResponseError } from "../src/utils/http/error.ts";
import {
    type HttpResult,
    type HttpSuccess,
    isHttpSuccess,
} from "../src/utils/http/result.ts";

test("HttpSuccess shape: kind='ok', status, data", () => {
    const ok: HttpSuccess<{ x: number }> = { kind: "ok", status: 200, data: { x: 42 } };
    expect(ok.kind).toBe("ok");
    expect(ok.status).toBe(200);
    expect(ok.data).toEqual({ x: 42 });
});

test("HttpResult discriminator works at the type + runtime level", () => {
    const results: HttpResult<string>[] = [
        { kind: "ok", status: 200, data: "yay" },
        new HttpResponseError(500, "/x"),
    ];
    let okCount = 0;
    let errCount = 0;
    for (const r of results) {
        if (r.kind === "ok") {
            okCount++;
            // type narrowing: r.data should be `string`
            expect(typeof r.data).toBe("string");
        } else {
            errCount++;
            expect(r instanceof HttpResponseError).toBe(true);
        }
    }
    expect(okCount).toBe(1);
    expect(errCount).toBe(1);
});

test("isHttpSuccess narrows to the success arm", () => {
    const ok: HttpResult<number> = { kind: "ok", status: 200, data: 7 };
    const err: HttpResult<number> = new HttpResponseError(404, "/missing");

    expect(isHttpSuccess(ok)).toBe(true);
    expect(isHttpSuccess(err)).toBe(false);

    if (isHttpSuccess(ok)) {
        expect(ok.data + 1).toBe(8); // narrows correctly
    }
});

import "dotenv/config";

const REDIRECT_ENGINE_URL = process.env.REDIRECT_ENGINE_URL || "http://localhost:4000";
const TEST_DOMAIN = "example.test";

async function testCountdown() {
  console.log("=".repeat(50));
  console.log("Redirect Countdown Page Test");
  console.log("=".repeat(50));
  console.log();

  const tests = [
    {
      name: "Health Check",
      url: `${REDIRECT_ENGINE_URL}/health`,
      check: (res: string, _h: Record<string, string>, status: number) => {
        return status === 200 && res.includes("ok");
      },
    },
    {
      name: "Root Path Redirect (with countdown)",
      url: `${REDIRECT_ENGINE_URL}/github`,
      headers: { Host: TEST_DOMAIN },
      check: (res: string, headers: Record<string, string>) => {
        return (
          headers["x-redirect-destination"]?.includes("github.com") &&
          res.includes("countdown") &&
          res.includes("You are being redirected")
        );
      },
    },
    {
      name: "Subdomain Redirect (with countdown)",
      url: `${REDIRECT_ENGINE_URL}/`,
      headers: { Host: `blog.${TEST_DOMAIN}` },
      check: (res: string, headers: Record<string, string>) => {
        return (
          headers["x-redirect-destination"]?.includes("medium.com") &&
          res.includes("Redirecting in")
        );
      },
    },
    {
      name: "Cancel Button Present",
      url: `${REDIRECT_ENGINE_URL}/github`,
      headers: { Host: TEST_DOMAIN },
      check: (res: string) => res.includes('onclick="cancelRedirect()'),
    },
    {
      name: "Go Now Button Present",
      url: `${REDIRECT_ENGINE_URL}/github`,
      headers: { Host: TEST_DOMAIN },
      check: (res: string) => res.includes('onclick="redirectNow()'),
    },
    {
      name: "Progress Bar Present",
      url: `${REDIRECT_ENGINE_URL}/github`,
      headers: { Host: TEST_DOMAIN },
      check: (res: string) => res.includes("progress-fill"),
    },
    {
      name: "Return to Home Link",
      url: `${REDIRECT_ENGINE_URL}/github`,
      headers: { Host: TEST_DOMAIN },
      check: (res: string) => res.includes("Return to home page"),
    },
    {
      name: "Non-existent route (404)",
      url: `${REDIRECT_ENGINE_URL}/nonexistent-path-xyz`,
      headers: { Host: TEST_DOMAIN },
      check: (res: string, _h: Record<string, string>, status: number) => status === 404,
    },
    {
      name: "Custom title from env",
      url: `${REDIRECT_ENGINE_URL}/github`,
      headers: { Host: TEST_DOMAIN },
      check: (res: string) => res.includes("You are being redirected"),
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    process.stdout.write(`[TEST] ${test.name}... `);

    try {
      const headers: Record<string, string> = {};
      const response = await fetch(test.url, {
        headers: test.headers,
        signal: AbortSignal.timeout(5000),
      });

      response.headers.forEach((value, key) => {
        headers[key.toLowerCase()] = value;
      });

      const text = await response.text();

      const success = test.check(text, headers, response.status);

      if (success) {
        console.log("PASS");
        passed++;
      } else {
        console.log("FAIL");
        failed++;
      }
    } catch (error) {
      console.log("ERROR:", (error as Error).message);
      failed++;
    }
  }

  console.log();
  console.log("=".repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log("=".repeat(50));

  return failed === 0;
}

testCountdown()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error("Test failed:", error);
    process.exit(1);
  });
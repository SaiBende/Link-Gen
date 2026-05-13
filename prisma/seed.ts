import "dotenv/config";
import { prisma } from "../src/lib/db/prisma";
import { createLookupKey } from "../src/lib/routing/lookup";

async function main() {
  const domain = await prisma.domain.upsert({
    where: { hostname: "example.test" },
    update: {
      status: "VERIFIED",
      wildcardEnabled: true,
      fallbackUrl: "https://example.com",
    },
    create: {
      hostname: "example.test",
      status: "VERIFIED",
      wildcardEnabled: true,
      fallbackUrl: "https://example.com",
      verificationToken: "dev-verification-token",
      dnsTxtName: "_redirect.example.test",
      dnsTxtValue: "redirect-platform-verification=dev-verification-token",
    },
  });

  const routes = [
    {
      subdomain: null,
      path: "/github",
      destinationUrl: "https://github.com",
    },
    {
      subdomain: null,
      path: "/resume",
      destinationUrl: "https://example.com/resume",
    },
    {
      subdomain: "blog",
      path: null,
      destinationUrl: "https://medium.com",
    },
    {
      subdomain: "docs",
      path: null,
      destinationUrl: "https://docs.example.com",
    },
    {
      subdomain: "go",
      path: "/start",
      destinationUrl: "https://example.com/start",
    },
  ];

  for (const route of routes) {
    const lookupKey = createLookupKey({
      matchType: "EXACT",
      subdomain: route.subdomain,
      path: route.path,
    });

    await prisma.route.upsert({
      where: {
        domainId_lookupKey: {
          domainId: domain.id,
          lookupKey,
        },
      },
      update: route,
      create: {
        domainId: domain.id,
        matchType: "EXACT",
        lookupKey,
        preserveQuery: true,
        ...route,
      },
    });
  }

  await prisma.route.upsert({
    where: {
      domainId_lookupKey: {
        domainId: domain.id,
        lookupKey: "fallback",
      },
    },
    update: {
      destinationUrl: "https://example.com",
    },
    create: {
      domainId: domain.id,
      matchType: "FALLBACK",
      lookupKey: "fallback",
      destinationUrl: "https://example.com",
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

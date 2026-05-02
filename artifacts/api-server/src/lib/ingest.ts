import { db, sourcesTable, listingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

const MOCK_LISTINGS: Record<
  string,
  Array<{
    externalId: string;
    brand: string;
    model: string;
    style: string;
    color: string;
    size: string;
    condition: string;
    price: number;
    originalPrice?: number;
    imageUrl: string;
    listingUrl: string;
    description: string;
  }>
> = {
  fashionphile: [
    {
      externalId: "fp-001",
      brand: "Hermès",
      model: "Birkin",
      style: "Birkin 30",
      color: "Etoupe",
      size: "30",
      condition: "Excellent",
      price: 18500,
      originalPrice: 21000,
      imageUrl: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800",
      listingUrl: "https://www.fashionphile.com/",
      description: "Hermès Birkin 30 in Etoupe Togo leather with Palladium hardware. Near mint condition.",
    },
    {
      externalId: "fp-002",
      brand: "Chanel",
      model: "Classic Flap",
      style: "Medium Classic Flap",
      color: "Black",
      size: "Medium",
      condition: "Very Good",
      price: 8200,
      originalPrice: 9000,
      imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800",
      listingUrl: "https://www.fashionphile.com/",
      description: "Chanel Medium Classic Flap in Black Caviar leather with Gold hardware.",
    },
    {
      externalId: "fp-003",
      brand: "Louis Vuitton",
      model: "Neverfull",
      style: "Neverfull MM",
      color: "Damier Ebene",
      size: "MM",
      condition: "Good",
      price: 1250,
      imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800",
      listingUrl: "https://www.fashionphile.com/",
      description: "Louis Vuitton Neverfull MM in Damier Ebene canvas.",
    },
  ],
  rebag: [
    {
      externalId: "rb-001",
      brand: "Hermès",
      model: "Kelly",
      style: "Kelly 28",
      color: "Gold",
      size: "28",
      condition: "Excellent",
      price: 22000,
      imageUrl: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800",
      listingUrl: "https://shop.rebag.com/",
      description: "Hermès Kelly 28 Sellier in Gold Epsom leather with Gold hardware.",
    },
    {
      externalId: "rb-002",
      brand: "Bottega Veneta",
      model: "Jodie",
      style: "Jodie",
      color: "Parakeet",
      size: "Medium",
      condition: "Very Good",
      price: 1850,
      originalPrice: 2200,
      imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800",
      listingUrl: "https://shop.rebag.com/",
      description: "Bottega Veneta Jodie in Parakeet Intrecciato leather.",
    },
    {
      externalId: "rb-003",
      brand: "Gucci",
      model: "Dionysus",
      style: "Dionysus Small",
      color: "Beige",
      size: "Small",
      condition: "Good",
      price: 980,
      originalPrice: 1400,
      imageUrl: "https://images.unsplash.com/photo-1594938298603-c8148c4b4f7a?w=800",
      listingUrl: "https://shop.rebag.com/",
      description: "Gucci Dionysus Small Shoulder Bag in Beige GG Supreme canvas.",
    },
  ],
  therealreal: [
    {
      externalId: "trr-001",
      brand: "Chanel",
      model: "Boy Bag",
      style: "Boy Medium",
      color: "Navy",
      size: "Medium",
      condition: "Excellent",
      price: 5800,
      originalPrice: 6500,
      imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800",
      listingUrl: "https://www.therealreal.com/",
      description: "Chanel Boy Bag in Navy Blue Lambskin leather with Silver hardware.",
    },
    {
      externalId: "trr-002",
      brand: "Prada",
      model: "Galleria",
      style: "Galleria Medium",
      color: "Saffiano Black",
      size: "Medium",
      condition: "Very Good",
      price: 1650,
      imageUrl: "https://images.unsplash.com/photo-1594938298603-c8148c4b4f7a?w=800",
      listingUrl: "https://www.therealreal.com/",
      description: "Prada Galleria in Black Saffiano leather. Clean interior.",
    },
    {
      externalId: "trr-003",
      brand: "Celine",
      model: "Luggage",
      style: "Micro Luggage",
      color: "Caramel",
      size: "Micro",
      condition: "Good",
      price: 1200,
      originalPrice: 1600,
      imageUrl: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800",
      listingUrl: "https://www.therealreal.com/",
      description: "Celine Micro Luggage in Caramel Smooth Leather.",
    },
  ],
  yoogiscloset: [
    {
      externalId: "yc-001",
      brand: "Hermès",
      model: "Birkin",
      style: "Birkin 35",
      color: "Black",
      size: "35",
      condition: "Very Good",
      price: 16800,
      imageUrl: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800",
      listingUrl: "https://www.yoogiscloset.com/",
      description: "Hermès Birkin 35 in Black Togo leather with Gold hardware.",
    },
    {
      externalId: "yc-002",
      brand: "Louis Vuitton",
      model: "Speedy",
      style: "Speedy Bandouliere 30",
      color: "Monogram",
      size: "30",
      condition: "Good",
      price: 780,
      originalPrice: 1050,
      imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800",
      listingUrl: "https://www.yoogiscloset.com/",
      description: "Louis Vuitton Speedy Bandouliere 30 in Monogram canvas with strap.",
    },
    {
      externalId: "yc-003",
      brand: "Fendi",
      model: "Baguette",
      style: "Baguette",
      color: "Blush",
      size: "Regular",
      condition: "Excellent",
      price: 2200,
      originalPrice: 2800,
      imageUrl: "https://images.unsplash.com/photo-1594938298603-c8148c4b4f7a?w=800",
      listingUrl: "https://www.yoogiscloset.com/",
      description: "Fendi Baguette in Blush Pink Zucca FF jacquard with silver hardware.",
    },
  ],
};

export async function runMockIngest(sourceSlug: string) {
  const startTime = Date.now();
  const errors: string[] = [];

  const [source] = await db
    .select()
    .from(sourcesTable)
    .where(eq(sourcesTable.slug, sourceSlug));

  if (!source) {
    return {
      sourceSlug,
      listingsFound: 0,
      listingsAdded: 0,
      listingsUpdated: 0,
      durationMs: Date.now() - startTime,
      errors: [`Source "${sourceSlug}" not found`],
    };
  }

  const mockData = MOCK_LISTINGS[sourceSlug] ?? [];
  let added = 0;
  let updated = 0;

  for (const item of mockData) {
    try {
      const existing = await db
        .select()
        .from(listingsTable)
        .where(eq(listingsTable.externalId, item.externalId));

      if (existing.length > 0) {
        await db
          .update(listingsTable)
          .set({
            price: String(item.price),
            originalPrice: item.originalPrice ? String(item.originalPrice) : null,
            isAvailable: true,
            seenAt: new Date(),
          })
          .where(eq(listingsTable.externalId, item.externalId));
        updated++;
      } else {
        await db.insert(listingsTable).values({
          sourceId: source.id,
          externalId: item.externalId,
          brand: item.brand,
          model: item.model,
          style: item.style,
          color: item.color,
          size: item.size,
          condition: item.condition,
          price: String(item.price),
          originalPrice: item.originalPrice ? String(item.originalPrice) : null,
          currency: "USD",
          imageUrl: item.imageUrl,
          listingUrl: item.listingUrl,
          description: item.description,
          isAvailable: true,
          seenAt: new Date(),
        });
        added++;
      }
    } catch (err) {
      errors.push(`Failed to upsert ${item.externalId}: ${err}`);
      logger.error({ err, externalId: item.externalId }, "Ingest error");
    }
  }

  // Update source metadata
  await db
    .update(sourcesTable)
    .set({
      lastIngestAt: new Date(),
      status: errors.length === 0 ? "healthy" : "degraded",
    })
    .where(eq(sourcesTable.id, source.id));

  return {
    sourceSlug,
    listingsFound: mockData.length,
    listingsAdded: added,
    listingsUpdated: updated,
    durationMs: Date.now() - startTime,
    errors,
  };
}

export async function runAllIngests() {
  const sources = await db.select().from(sourcesTable).where(eq(sourcesTable.isActive, true));
  for (const source of sources) {
    await runMockIngest(source.slug);
  }
}

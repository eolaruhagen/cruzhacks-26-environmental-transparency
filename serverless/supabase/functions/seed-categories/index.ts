/**
 * Seed Categories Edge Function (One-Shot)
 * 
 * Purpose: Generate embeddings for all environmental policy subcategories
 * and populate the categories_embeddings table.
 * 
 * This is a one-time setup function. Run it once to seed the categories.
 * 
 * Categories Structure:
 * - air_and_atmosphere: Air Quality, Ozone, Acid Rain, Noise
 * - water_resources: Water Quality, Drinking Water, Ocean/Coastal, Ocean Dumping
 * - waste_and_toxics: Hazardous Waste, Solid Waste, Toxic Substances, Pesticides
 * - energy_and_resources: Renewable Energy, Nuclear, Fossil Fuels, Efficiency
 * - land_and_conservation: Public Lands, Wildlife, Biodiversity, Parks
 * - climate_and_emissions: Greenhouse Gas, Climate Adaptation, Sea Level Rise
 * - disaster_and_emergency: Chemical Emergency, Oil Spill, Flood/Coastal Hazard
 * - justice_and_environment: Environmental Justice, Civil Rights, Interstate Disputes
 * 
 * Environment Variables:
 * - SUPABASE_URL (auto-provided)
 * - SUPABASE_SERVICE_ROLE_KEY (auto-provided)
 * - OPENAI_API_KEY (required for embeddings)
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// OpenAI embedding model
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

// Category definitions with subcategories
// bill_type enum -> subcategory name -> description for embedding
const CATEGORIES: Record<string, { subcategory: string; description: string }[]> = {
  air_and_atmosphere: [
    {
      subcategory: "Air Quality and Pollution Control",
      description: "Air Quality and Pollution Control - Legislation addressing air quality standards, air pollution prevention and control, emissions monitoring, clean air regulations, industrial air emissions, vehicle emissions standards, and atmospheric pollution reduction.",
    },
    {
      subcategory: "Ozone Layer Protection",
      description: "Ozone Layer Protection - Bills related to protecting the stratospheric ozone layer, regulating ozone-depleting substances, chlorofluorocarbons (CFCs), Montreal Protocol implementation, and atmospheric ozone recovery.",
    },
    {
      subcategory: "Acid Rain Reduction",
      description: "Acid Rain Reduction - Legislation targeting acid rain causes and effects, sulfur dioxide emissions, nitrogen oxide emissions, acid deposition prevention, and impacts on forests and water bodies.",
    },
    {
      subcategory: "Noise Pollution Control",
      description: "Noise Pollution Control - Bills addressing noise pollution, sound level regulations, airport noise, transportation noise, industrial noise standards, and community noise impacts.",
    },
  ],
  water_resources: [
    {
      subcategory: "Water Quality and Pollution",
      description: "Water Quality and Pollution - Legislation on water quality standards, water pollution control, Clean Water Act, point source pollution, nonpoint source pollution, wastewater treatment, and water body restoration.",
    },
    {
      subcategory: "Drinking Water Safety",
      description: "Drinking Water Safety - Bills addressing safe drinking water, Safe Drinking Water Act, public water systems, water treatment standards, contaminant limits, and drinking water infrastructure.",
    },
    {
      subcategory: "Ocean and Coastal Resources",
      description: "Ocean and Coastal Resources - Legislation on ocean conservation, coastal zone management, marine resources protection, coastal erosion, shoreline protection, and ocean ecosystem health.",
    },
    {
      subcategory: "Ocean Dumping Prevention",
      description: "Ocean Dumping Prevention - Bills regulating ocean dumping, marine debris, dumping of waste materials at sea, and protection of marine environments from disposal activities.",
    },
  ],
  waste_and_toxics: [
    {
      subcategory: "Hazardous Waste Management",
      description: "Hazardous Waste Management (Superfund/CERCLA) - Legislation on hazardous waste disposal, Superfund cleanup, CERCLA, contaminated site remediation, toxic waste storage, and hazardous materials handling.",
    },
    {
      subcategory: "Solid and Municipal Waste",
      description: "Solid and Municipal Waste - Bills addressing solid waste management, municipal waste, landfills, recycling programs, waste reduction, composting, and garbage disposal regulations.",
    },
    {
      subcategory: "Toxic Substances Control",
      description: "Toxic Substances Control - Legislation on toxic chemical regulation, Toxic Substances Control Act (TSCA), chemical safety, industrial chemicals, and toxic substance testing requirements.",
    },
    {
      subcategory: "Pesticides Regulation",
      description: "Pesticides Regulation (FIFRA) - Bills regulating pesticides, Federal Insecticide, Fungicide, and Rodenticide Act, pesticide safety, agricultural chemicals, and pesticide application standards.",
    },
  ],
  energy_and_resources: [
    {
      subcategory: "Renewable Energy Development",
      description: "Renewable Energy Development - Legislation promoting renewable energy, solar power, wind energy, hydroelectric, geothermal, biomass energy, clean energy incentives, and renewable portfolio standards.",
    },
    {
      subcategory: "Nuclear Energy and Radiation",
      description: "Nuclear Energy and Radiation - Bills on nuclear power, nuclear safety, radiation protection, radioactive waste, nuclear plant regulations, and nuclear energy policy.",
    },
    {
      subcategory: "Fossil Fuel Extraction Impacts",
      description: "Fossil Fuel Extraction Impacts - Legislation addressing environmental impacts of fossil fuel extraction, coal mining, oil drilling, natural gas extraction, fracking regulations, and extraction site remediation.",
    },
    {
      subcategory: "Energy Efficiency Standards",
      description: "Energy Efficiency Standards - Bills promoting energy efficiency, appliance standards, building efficiency codes, fuel economy standards, energy conservation, and efficiency incentives.",
    },
  ],
  land_and_conservation: [
    {
      subcategory: "Public Lands and Forests",
      description: "Public Lands and Forests - Legislation on public lands management, national forests, Bureau of Land Management, forest conservation, timber management, and federal land use policy.",
    },
    {
      subcategory: "Wildlife and Endangered Species",
      description: "Wildlife and Endangered Species - Bills addressing wildlife protection, Endangered Species Act, species conservation, wildlife habitat, threatened species, and wildlife management.",
    },
    {
      subcategory: "Biodiversity and Habitat Protection",
      description: "Biodiversity and Habitat Protection - Legislation on biodiversity conservation, habitat preservation, ecosystem protection, native species, invasive species control, and ecological corridors.",
    },
    {
      subcategory: "Parks and Recreation Areas",
      description: "Parks and Recreation Areas - Bills on national parks, state parks, recreation areas, wilderness areas, scenic rivers, trails, and outdoor recreation management.",
    },
  ],
  climate_and_emissions: [
    {
      subcategory: "Greenhouse Gas Emissions",
      description: "Greenhouse Gas Emissions (beyond Carbon) - Legislation on greenhouse gas reduction, methane emissions, nitrous oxide, fluorinated gases, emissions caps, carbon pricing, and climate pollutants.",
    },
    {
      subcategory: "Climate Adaptation and Resilience",
      description: "Climate Adaptation and Resilience - Bills on climate change adaptation, climate resilience, infrastructure resilience, community adaptation planning, and climate impact preparation.",
    },
    {
      subcategory: "Sea Level Rise Mitigation",
      description: "Sea Level Rise Mitigation - Legislation addressing sea level rise impacts, coastal flooding, storm surge protection, coastal community resilience, and sea level rise planning.",
    },
  ],
  disaster_and_emergency: [
    {
      subcategory: "Chemical Emergency Preparedness",
      description: "Chemical Emergency Preparedness - Legislation on chemical accident prevention, emergency planning, EPCRA, chemical facility safety, hazardous chemical releases, and community right-to-know.",
    },
    {
      subcategory: "Oil Spill Response",
      description: "Oil Spill Response - Bills on oil spill prevention, Oil Pollution Act, spill response, cleanup operations, oil spill liability, and marine oil pollution.",
    },
    {
      subcategory: "Flood and Coastal Hazard Mitigation",
      description: "Flood and Coastal Hazard Mitigation - Legislation on flood control, flood insurance, coastal hazards, storm protection, flood mitigation infrastructure, and floodplain management.",
    },
  ],
  justice_and_environment: [
    {
      subcategory: "Environmental Justice Communities",
      description: "Environmental Justice Communities - Legislation on environmental justice, disadvantaged communities, pollution burden, equitable environmental protection, and community health impacts.",
    },
    {
      subcategory: "Civil Rights in Enforcement",
      description: "Civil Rights in Environmental Enforcement - Bills addressing civil rights in environmental law enforcement, discrimination in environmental policy, equal protection, and enforcement equity.",
    },
    {
      subcategory: "Interstate Pollution Disputes",
      description: "Interstate Pollution Disputes - Legislation on cross-border pollution, interstate environmental conflicts, transboundary pollution, and multi-state environmental coordination.",
    },
  ],
};

/**
 * Call OpenAI Embeddings API with batch of texts
 */
async function generateEmbeddings(
  texts: string[],
  apiKey: string
): Promise<number[][]> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  const sorted = data.data.sort((a: { index: number }, b: { index: number }) => a.index - b.index);
  return sorted.map((item: { embedding: number[] }) => item.embedding);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const openaiKey = Deno.env.get("OPENAI_API_KEY") ?? "";

    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Flatten all subcategories with their parent bill_type
    const allSubcategories: {
      subcategory: string;
      description: string;
      bill_type: string;
    }[] = [];

    for (const [billType, subcats] of Object.entries(CATEGORIES)) {
      for (const subcat of subcats) {
        allSubcategories.push({
          subcategory: subcat.subcategory,
          description: subcat.description,
          bill_type: billType,
        });
      }
    }

    console.log(`Generating embeddings for ${allSubcategories.length} subcategories...`);

    // Generate embeddings for all descriptions
    const descriptions = allSubcategories.map(s => s.description);
    const embeddings = await generateEmbeddings(descriptions, openaiKey);

    // Prepare insert data
    const insertData = allSubcategories.map((subcat, idx) => ({
      subcategory: subcat.subcategory,
      description: subcat.description,
      bill_type: subcat.bill_type,
      embedding: JSON.stringify(embeddings[idx]),
    }));

    // Clear existing data and insert fresh
    const { error: deleteError } = await supabase
      .from("categories_embeddings")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000"); // Delete all

    if (deleteError) {
      console.warn("Delete warning:", deleteError.message);
    }

    // Insert new data
    const { data: inserted, error: insertError } = await supabase
      .from("categories_embeddings")
      .insert(insertData)
      .select("id, subcategory, bill_type");

    if (insertError) {
      return new Response(
        JSON.stringify({
          error: "Failed to insert categories",
          details: insertError.message,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Group results by bill_type for nice output
    const byCategory: Record<string, string[]> = {};
    for (const row of inserted || []) {
      if (!byCategory[row.bill_type]) {
        byCategory[row.bill_type] = [];
      }
      byCategory[row.bill_type].push(row.subcategory);
    }

    return new Response(
      JSON.stringify({
        message: `Successfully seeded ${inserted?.length || 0} category embeddings`,
        categories: byCategory,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error:", errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

import Ajv2020 from "ajv/dist/2020.js";
import { defaultSchemaPath, readJson } from "./core.mjs";

let validatorPromise;

async function getValidator(schemaPath = defaultSchemaPath) {
  if (!validatorPromise || schemaPath !== defaultSchemaPath) {
    validatorPromise = readJson(schemaPath).then((schema) => {
      const ajv = new Ajv2020({ allErrors: true, strict: true, formats: { "date-time": true } });
      return ajv.compile(schema);
    });
  }
  return validatorPromise;
}

export async function validateManifest(manifest, schemaPath = defaultSchemaPath) {
  const validate = await getValidator(schemaPath);
  if (!validate(manifest)) {
    const details = validate.errors
      .map((error) => `${error.instancePath || "/"} ${error.message}`)
      .join("; ");
    throw new Error(`Manifest schema validation failed: ${details}`);
  }
  return manifest;
}

export function validateImageApiResponse(payload) {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.data) || payload.data.length === 0) {
    throw new Error("OpenAI image response did not contain a data array");
  }
  const item = payload.data[0];
  if (!item || typeof item !== "object" || typeof item.b64_json !== "string" || item.b64_json.length < 32) {
    throw new Error("OpenAI image response did not contain data[0].b64_json");
  }
  return item.b64_json;
}

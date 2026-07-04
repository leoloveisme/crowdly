// src/devRuntimeCode.txt
var devRuntimeCode_default = 'import * as ReactJSXDevRuntime from "react/jsx-dev-runtime";\n\nconst _jsxDEV = ReactJSXDevRuntime.jsxDEV;\nexport const Fragment = ReactJSXDevRuntime.Fragment;\n\nconst _isBrowser = typeof window !== "undefined";\n\nconst SOURCE_KEY = Symbol.for("__jsxSource__");\n\nconst cleanFileName = (fileName) => {\n  if (!fileName) return "";\n  if (fileName.includes("dev_server")) {\n    fileName = fileName.split("dev_server")[1].slice(1);\n  }\n  if (fileName.includes("sandbox-scheduler/sandbox")) {\n    const sandboxPart = fileName.split("sandbox-scheduler/")[1];\n    fileName = sandboxPart.split("/").slice(1).join("/");\n  }\n  return fileName.replace(/^\\/dev-server\\//, "");\n};\n\nconst sourceElementMap = new Map();\nif (_isBrowser) {\n  window.sourceElementMap = sourceElementMap;\n}\n\nfunction getSourceKey(sourceInfo) {\n  return `${cleanFileName(sourceInfo.fileName)}:${sourceInfo.lineNumber}:${sourceInfo.columnNumber}`;\n}\n\nfunction unregisterElement(node, sourceInfo) {\n  const key = getSourceKey(sourceInfo);\n  const refs = sourceElementMap.get(key);\n  if (refs) {\n    for (const ref of refs) {\n      if (ref.deref() === node) {\n        refs.delete(ref);\n        break;\n      }\n    }\n    if (refs.size === 0) {\n      sourceElementMap.delete(key);\n    }\n  }\n}\n\nfunction registerElement(node, sourceInfo) {\n  const key = getSourceKey(sourceInfo);\n  if (!sourceElementMap.has(key)) {\n    sourceElementMap.set(key, new Set());\n  }\n  sourceElementMap.get(key).add(new WeakRef(node));\n}\n\nfunction getTypeName(type) {\n  if (typeof type === "string") return type;\n  if (typeof type === "function") return type.displayName || type.name || "Unknown";\n  if (typeof type === "object" && type !== null) {\n    return type.displayName || type.render?.displayName || type.render?.name || "Unknown";\n  }\n  return "Unknown";\n}\n\nexport function jsxDEV(type, props, key, isStatic, source, self) {\n  // During SSR, skip all tagging and pass through to React\'s jsxDEV\n  if (!_isBrowser) {\n    return _jsxDEV(type, props, key, isStatic, source, self);\n  }\n\n  // For custom components (like <Icon />, <Button />), tag their rendered output\n  // This captures the JSX element name for library components that don\'t have source info\n  if (source?.fileName && typeof type !== "string" && type !== Fragment) {\n    const typeName = getTypeName(type);\n    const jsxSourceInfo = {\n      fileName: cleanFileName(source.fileName),\n      lineNumber: source.lineNumber,\n      columnNumber: source.columnNumber,\n      displayName: typeName,\n    };\n\n    const originalRef = props?.ref;\n    const enhancedProps = {\n      ...props,\n      ref: (node) => {\n        if (node) {\n          // Only tag if this element doesn\'t already have source info\n          // (library components won\'t have it, user components will)\n          if (!node[SOURCE_KEY]) {\n            node[SOURCE_KEY] = jsxSourceInfo;\n            registerElement(node, jsxSourceInfo);\n          }\n        }\n        if (typeof originalRef === "function") {\n          originalRef(node);\n        } else if (originalRef && typeof originalRef === "object") {\n          originalRef.current = node;\n        }\n      },\n    };\n\n    return _jsxDEV(type, enhancedProps, key, isStatic, source, self);\n  }\n\n  // For host elements (div, span, etc.), tag with component context\n  if (source?.fileName && typeof type === "string") {\n    const sourceInfo = {\n      fileName: cleanFileName(source.fileName),\n      lineNumber: source.lineNumber,\n      columnNumber: source.columnNumber,\n      displayName: type,\n    };\n\n    const originalRef = props?.ref;\n\n    const enhancedProps = {\n      ...props,\n      ref: (node) => {\n        if (node) {\n          const existingSource = node[SOURCE_KEY];\n          if (existingSource) {\n            if (getSourceKey(existingSource) !== getSourceKey(sourceInfo)) {\n              unregisterElement(node, existingSource);\n              node[SOURCE_KEY] = sourceInfo;\n              registerElement(node, sourceInfo);\n            }\n          } else {\n            node[SOURCE_KEY] = sourceInfo;\n            registerElement(node, sourceInfo);\n          }\n        }\n        if (typeof originalRef === "function") {\n          originalRef(node);\n        } else if (originalRef && typeof originalRef === "object") {\n          originalRef.current = node;\n        }\n      },\n    };\n    return _jsxDEV(type, enhancedProps, key, isStatic, source, self);\n  }\n\n  return _jsxDEV(type, props, key, isStatic, source, self);\n}\n';

// src/features/jsxSource.ts
function createJsxTaggerFeature() {
  return {
    resolveId(id, importer) {
      if (id === "react/jsx-dev-runtime" && !importer?.includes("\0jsx-source")) {
        return "\0jsx-source/jsx-dev-runtime";
      }
      return null;
    },
    load(id) {
      if (id === "\0jsx-source/jsx-dev-runtime") {
        return devRuntimeCode_default;
      }
      return null;
    }
  };
}

// src/features/tailwindConfig.ts
import * as esbuild from "esbuild";
import fs from "fs/promises";
import path from "path";
import resolveConfig from "tailwindcss/resolveConfig.js";
var V4_CSS_CANDIDATES = ["src/styles.css", "src/index.css", "src/globals.css", "src/app.css"];
var V4_NAMESPACES = {
  colors: "--color",
  screens: "--breakpoint",
  spacing: "--spacing",
  borderRadius: "--radius",
  fontFamily: "--font",
  opacity: "--opacity"
};
async function findV4CssEntry(projectRoot) {
  for (const candidate of V4_CSS_CANDIDATES) {
    const abs = path.resolve(projectRoot, candidate);
    try {
      const contents = await fs.readFile(abs, "utf8");
      if (/@import\s+["']tailwindcss/.test(contents)) {
        return abs;
      }
    } catch {
    }
  }
  return null;
}
async function loadDesignSystemFromProject() {
  try {
    const modName = "@tailwindcss/node";
    const mod = await import(modName);
    return mod.__unstable__loadDesignSystem;
  } catch {
    return null;
  }
}
function parseRootVars(css) {
  const vars = {};
  const rootMatch = css.match(/:root\s*\{([^}]*)\}/s);
  if (!rootMatch)
    return vars;
  for (const decl of rootMatch[1].split(";")) {
    const trimmed = decl.trim();
    if (!trimmed.startsWith("--"))
      continue;
    const colon = trimmed.indexOf(":");
    if (colon === -1)
      continue;
    const key = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trim();
    if (key && value)
      vars[key] = value;
  }
  return vars;
}
function resolveVars(value, rootVars, depth = 0) {
  if (depth > 8)
    return value;
  return value.replace(/var\(\s*(--[\w-]+)(?:\s*,\s*([^)]+))?\s*\)/g, (match, name, fallback) => {
    const resolved = rootVars[name];
    if (resolved !== void 0) {
      return resolveVars(resolved, rootVars, depth + 1);
    }
    return fallback ?? match;
  });
}
async function generateV4Config(cssEntry, outfile, load) {
  const css = await fs.readFile(cssEntry, "utf8");
  const ds = await load(css, { base: path.dirname(cssEntry) });
  const rootVars = parseRootVars(css);
  const theme = {};
  for (const [configKey, namespace] of Object.entries(V4_NAMESPACES)) {
    const entries = {};
    for (const [key, rawValue] of ds.theme.namespace(namespace)) {
      if (key === null)
        continue;
      entries[key] = resolveVars(rawValue, rootVars);
    }
    theme[configKey] = entries;
  }
  await fs.mkdir(path.dirname(outfile), { recursive: true });
  await fs.writeFile(outfile, JSON.stringify({ theme }, null, 2));
}
function createTailwindConfigFeature() {
  let projectRoot = "";
  const generateV3Config = async (tailwindInputFile, tailwindIntermediateFile, tailwindJsonOutfile) => {
    try {
      await esbuild.build({
        entryPoints: [tailwindInputFile],
        outfile: tailwindIntermediateFile,
        bundle: true,
        format: "esm",
        banner: {
          js: 'import { createRequire } from "module"; const require = createRequire(import.meta.url);'
        }
      });
      try {
        const userConfig = await import(tailwindIntermediateFile + "?update=" + Date.now());
        if (!userConfig || !userConfig.default) {
          console.error("Invalid Tailwind config structure:", userConfig);
          throw new Error("Invalid Tailwind config structure");
        }
        const resolvedConfig = resolveConfig(userConfig.default);
        await fs.writeFile(tailwindJsonOutfile, JSON.stringify(resolvedConfig, null, 2));
        await fs.unlink(tailwindIntermediateFile).catch(() => {
        });
      } catch (error) {
        console.error("Error processing config:", error);
        throw error;
      }
    } catch (error) {
      console.error("Error in generateConfig:", error);
      throw error;
    }
  };
  const run = async () => {
    const outfile = path.resolve(projectRoot, "./src/tailwind.config.lov.json");
    const cssEntry = await findV4CssEntry(projectRoot);
    if (cssEntry) {
      const load = await loadDesignSystemFromProject();
      if (load) {
        try {
          await generateV4Config(cssEntry, outfile, load);
          console.log(`[lovable-tagger] wrote ${outfile}`);
          return;
        } catch (error) {
          console.error("Error generating tailwind.config.lov.json:", error);
          return;
        }
      }
    }
    const v3ConfigFile = path.resolve(projectRoot, "./tailwind.config.ts");
    try {
      await fs.access(v3ConfigFile);
    } catch {
      return;
    }
    const intermediate = path.resolve(projectRoot, "./.lov.tailwind.config.js");
    try {
      await generateV3Config(v3ConfigFile, intermediate, outfile);
      console.log(`[lovable-tagger] wrote ${outfile}`);
    } catch (error) {
      console.error("Error generating tailwind.config.lov.json:", error);
    }
  };
  return {
    onConfigResolved(config) {
      projectRoot = config.root;
    },
    async onBuildStart() {
      await run();
    },
    onConfigureServer(server) {
      try {
        const v3ConfigFile = path.resolve(projectRoot, "./tailwind.config.ts");
        const v4Candidates = V4_CSS_CANDIDATES.map((c) => path.resolve(projectRoot, c));
        const watchPaths = [v3ConfigFile, ...v4Candidates];
        for (const p of watchPaths) {
          server.watcher.add(p);
        }
        const normalized = new Set(watchPaths.map((p) => path.normalize(p)));
        server.watcher.on("change", async (changedPath) => {
          if (normalized.has(path.normalize(changedPath))) {
            await run();
          }
        });
      } catch (error) {
        console.error("Error adding watcher:", error);
      }
    }
  };
}

// src/plugin.ts
var isSandbox = process.env.LOVABLE_DEV_SERVER === "true";
function lovableTagger({
  jsxSource = isSandbox,
  tailwindConfig = isSandbox
} = {}) {
  const features = [];
  if (jsxSource) {
    features.push(createJsxTaggerFeature());
  }
  if (tailwindConfig) {
    features.push(createTailwindConfigFeature());
  }
  return {
    name: "lovable-plugin",
    enforce: "pre",
    configResolved(config) {
      for (const feature of features) {
        feature.onConfigResolved?.(config);
      }
    },
    async buildStart() {
      for (const feature of features) {
        await feature.onBuildStart?.();
      }
    },
    configureServer(server) {
      for (const feature of features) {
        feature.onConfigureServer?.(server);
      }
    },
    resolveId(id, importer) {
      for (const feature of features) {
        const result = feature.resolveId?.(id, importer);
        if (result !== null && result !== void 0) {
          return result;
        }
      }
      return null;
    },
    load(id) {
      for (const feature of features) {
        const result = feature.load?.(id);
        if (result !== null && result !== void 0) {
          return result;
        }
      }
      return null;
    }
  };
}
export {
  lovableTagger as componentTagger
};

import type { Linter, ESLint } from "eslint";
import { getEslintPath } from "./getEslintPath";
import { getEslintConfig } from "./getEslintConfig";

let eslintPath: string | null = null;
let eslintConfigPath: string | null = null;
nova.config.onDidChange("apexskier.eslint.config.eslintPath", async () => {
  eslintPath = await getEslintPath();
  console.log("Updating ESLint executable globally", eslintPath);
});
nova.workspace.config.onDidChange(
  "apexskier.eslint.config.eslintPath",
  async () => {
    eslintPath = await getEslintPath();
    console.log("Updating ESLint executable for workspace", eslintPath);
  }
);
nova.config.onDidChange("apexskier.eslint.config.eslintConfigPath", () => {
  eslintConfigPath = getEslintConfig();
  console.log("Updating ESLint config globally", eslintConfigPath);
});
nova.workspace.config.onDidChange(
  "apexskier.eslint.config.eslintConfigPath",
  () => {
    eslintConfigPath = getEslintConfig();
    console.log("Updating ESLint config for workspace", eslintConfigPath);
  }
);

export async function initialize() {
  eslintPath = await getEslintPath();
  eslintConfigPath = getEslintConfig();
}

const syntaxToRequiredPlugin: { [syntax: string]: string | undefined } = {
  html: "html",
  vue: "vue",
  markdown: "markdown",
};

export type ESLintRunResults = ReadonlyArray<ESLint.LintResult>;

export function runEslint(
  content: string,
  uri: string,
  syntax: string,
  // eslint-disable-next-line no-unused-vars
  callback: (err: Error | ESLintRunResults) => void
): Disposable {
  const disposable = new CompositeDisposable();
  const workspacePath = nova.workspace.path || undefined;
  if (!nova.workspace.path) {
    console.warn("ESLint used without a workspace path");
  }
  if (!eslintPath) {
    console.warn("No ESLint path");
    return disposable;
  }
  const eslint = eslintPath;
  const eslintConfig = eslintConfigPath;
  // remove file:/Volumes/Macintosh HD from uri
  const cleanFileName = "/" + decodeURI(uri.split("/").slice(3).join("/"));

  // one idea for a performance improvement here would be to cache the needed results
  // on a file path basis.
  // Risks
  // - if the eslint config or installed packages change it'll be hard to invalidate the cache
  // - handling file renaming?
  function getConfig(
    // eslint-disable-next-line no-unused-vars
    callback: (config: Linter.Config) => void
  ): void {
    const configProcess = new Process(eslint, {
      args: ["--print-config", cleanFileName],
      cwd: workspacePath,
      stdio: "pipe",
    });
    disposable.add({
      dispose() {
        configProcess.terminate();
      },
    });
    let configStr = "";
    configProcess.onStdout((line) => (configStr += line));
    configProcess.onStderr(console.warn.bind(console));
    configProcess.onDidExit((status) => {
      const configProcessWasTerminated = status === 15;
      if (status !== 0 && !configProcessWasTerminated) {
        throw new Error(
          `failed to get eslint config for ${cleanFileName}: ${status}`
        );
      }
      if (configProcessWasTerminated) {
        return;
      }
      callback(JSON.parse(configStr));
    });
    configProcess.start();
  }

  function getLintResults(
    // eslint-disable-next-line no-unused-vars
    callback: (err: Error | ESLintRunResults) => void
  ): void {
    const lintArgs = [
      "--format=json",
      "--stdin",
      "--stdin-filename",
      cleanFileName,
    ];
    if (eslintConfig) {
      lintArgs.unshift("--config", eslintConfig);
    }
    const lintProcess = new Process(eslint, {
      args: lintArgs,
      cwd: workspacePath,
      stdio: "pipe",
    });
    disposable.add({
      dispose() {
        lintProcess.terminate();
      },
    });

    let lintOutput = "";
    lintProcess.onStdout((line) => (lintOutput += line));
    lintProcess.onStderr(console.warn.bind(console));
    lintProcess.onDidExit((status) => {
      const lintProcessWasTerminated = status === 15;
      // https://eslint.org/docs/user-guide/command-line-interface#exit-codes
      const areLintErrors = status === 1;
      const noLintErrors = status === 0;
      if (!areLintErrors && !noLintErrors && !lintProcessWasTerminated) {
        callback(new Error(`failed to lint (${status}) ${cleanFileName}`));
      }
      if (lintProcessWasTerminated) {
        return;
      }

      const response = JSON.parse(lintOutput) as ESLintRunResults;
      callback(response);
    });

    lintProcess.start();

    // TODO: Improve readable stream types
    const writer = (lintProcess.stdin as any).getWriter();
    writer.ready.then(() => {
      writer.write(content);
      writer.close();
    });
  }

  // if a plugin is required to parse this syntax we need to verify it's been found for this file
  // check in the config for this file
  const requiredPlugin = syntaxToRequiredPlugin[syntax];
  if (requiredPlugin) {
    getConfig((config) => {
      if (!config.plugins?.includes(requiredPlugin)) {
        callback(
          new Error(
            `${syntax} requires installing eslint-plugin-${requiredPlugin}`
          )
        );
      } else {
        getLintResults(callback);
      }
    });
  } else {
    // if plugins aren't required, just lint right away
    getLintResults(callback);
  }

  return disposable;
}

export function fixEslint(path: string) {
  if (!eslintPath) {
    console.warn("Can't find eslint executable");
    return;
  }

  const process = new Process(eslintPath, {
    args: ["--fix", "--format=json", path],
    cwd: nova.workspace.path || undefined,
    stdio: "pipe",
  });

  process.onStderr(console.warn.bind(console));

  process.start();

  return process;
}

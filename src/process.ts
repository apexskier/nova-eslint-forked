import type { Linter } from "eslint";
import { getEslintPath } from "./getEslintPath";

let eslintPath: string | null = null;
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
(async () => {
  eslintPath = await getEslintPath();
})();

const filePrefixRegex = /^file:/;

const syntaxToPlugin: { [syntax: string]: string } = {
  html: "html",
  vue: "vue",
  markdown: "markdown",
};

export function runEslint(
  content: string,
  uri: string,
  syntax: string,
  // eslint-disable-next-line no-unused-vars
  callback: (issues: Array<Linter.LintMessage>) => void
) {
  if (!nova.workspace.path || !eslintPath) {
    return;
  }
  const eslint = eslintPath;
  const workspacePath = nova.workspace.path;

  const cleanFileName = decodeURI(uri).replace(filePrefixRegex, "");

  const configProcess = new Process("/usr/bin/env", {
    args: [eslint, "--format=json", "--print-config", cleanFileName],
    cwd: workspacePath,
    stdio: "pipe",
  });
  let configStr = "";
  configProcess.onStdout((line) => (configStr += line));
  configProcess.onStderr(handleError);

  configProcess.onDidExit((status) => {
    if (status !== 0) {
      callback([]);
      throw new Error(`failed to get eslint config for ${cleanFileName}`);
    }
    const config = JSON.parse(configStr);

    console.log(syntax);
    // check that we're good to validate
    if (
      syntaxToPlugin[syntax] &&
      !config.plugins.includes(syntaxToPlugin[syntax])
    ) {
      console.log("not linting");
      callback([]);
      return;
    }
    console.log("linting");

    const process = new Process("/usr/bin/env", {
      args: [
        eslint,
        "--format=json",
        "--stdin",
        "--stdin-filename",
        cleanFileName,
      ],
      cwd: workspacePath,
      stdio: "pipe",
    });

    process.onStdout(handleOutput);
    process.onStderr(handleError);

    process.start();

    // TODO: Improve readable stream types
    const writer = (process.stdin as any).getWriter();
    writer.ready.then(() => {
      writer.write(content);
      writer.close();
    });

    return process;

    function handleOutput(output: string) {
      const parsedOutput = JSON.parse(output);
      const messages = parsedOutput[0]["messages"] as Array<Linter.LintMessage>;

      callback(messages);
    }
  });

  configProcess.start();
  return configProcess;
}

export function fixEslint(path: string) {
  if (!nova.workspace.path || !eslintPath) {
    return;
  }

  const process = new Process("/usr/bin/env", {
    args: [eslintPath, "--fix", "--format=json", path],
    cwd: nova.workspace.path,
    stdio: "pipe",
  });

  process.onStderr(handleError);

  process.start();

  return process;
}

function handleError(error: string) {
  console.warn(error);
}

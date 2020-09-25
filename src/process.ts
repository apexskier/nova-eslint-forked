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

const syntaxToRequiredPlugin: { [syntax: string]: string } = {
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
): Disposable {
  const disposable = new CompositeDisposable();
  if (!nova.workspace.path || !eslintPath) {
    return disposable;
  }
  const eslint = eslintPath;
  const workspacePath = nova.workspace.path;

  const cleanFileName = decodeURI(uri).replace(filePrefixRegex, "");

  // TODO: don't run configProcess if syntax doesn't have a required plugin, we can just proceed

  const configProcess = new Process("/usr/bin/env", {
    args: [eslint, "--format=json", "--print-config", cleanFileName],
    cwd: workspacePath,
    stdio: "pipe",
  });
  disposable.add({
    dispose() {
      configProcess.terminate();
    },
  });

  let configStr = "";
  disposable.add(configProcess.onStdout((line) => (configStr += line)));
  disposable.add(configProcess.onStderr(handleError));
  disposable.add(
    configProcess.onDidExit((status) => {
      const configProcessWasTerminated = status === 15;
      if (status !== 0 && !configProcessWasTerminated) {
        callback([]);
        throw new Error(
          `failed to get eslint config for ${cleanFileName}: ${status}`
        );
      }
      if (configProcessWasTerminated) {
        return;
      }

      const config = JSON.parse(configStr);

      const lintProcess = new Process("/usr/bin/env", {
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
      disposable.add({
        dispose() {
          lintProcess.terminate();
        },
      });

      // check that we're good to validate
      if (
        syntaxToRequiredPlugin[syntax] &&
        !config.plugins.includes(syntaxToRequiredPlugin[syntax])
      ) {
        callback([]);
        return;
      }

      let lintOutput = "";
      disposable.add(lintProcess.onStdout((line) => (lintOutput += line)));
      disposable.add(lintProcess.onStderr(handleError));
      disposable.add(
        lintProcess.onDidExit((status) => {
          const lintProcessWasTerminated = status === 15;
          // https://eslint.org/docs/user-guide/command-line-interface#exit-codes
          const areLintErrors = status === 1;
          const noLintErrors = status === 0;
          if (!areLintErrors && !noLintErrors && !lintProcessWasTerminated) {
            callback([]);
            throw new Error(`failed to lint ${cleanFileName}: ${status}`);
          }
          if (lintProcessWasTerminated) {
            return;
          }
          if (noLintErrors) {
            callback([]);
          }

          const parsedOutput = JSON.parse(lintOutput);
          const messages = parsedOutput[0]["messages"] as Array<
            Linter.LintMessage
          >;
          callback(messages);
        })
      );

      lintProcess.start();

      // TODO: Improve readable stream types
      const writer = (lintProcess.stdin as any).getWriter();
      writer.ready.then(() => {
        writer.write(content);
        writer.close();
      });
    })
  );

  configProcess.start();

  return disposable;
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

import type { ESLint, Linter as ESLintLinter } from "eslint";
import { eslintOutputToIssue } from "./eslintOutputToIssue";
import { runEslint } from "./process";

function positionToRange(
  document: TextDocument,
  position: {
    line: number;
    column: number;
    endLine: number;
    endColumn: number;
  }
): Range {
  const fullContents = document.getTextInRange(new Range(0, document.length));
  let rangeStart = 0;
  let rangeEnd = 0;
  let chars = 0;
  const lines = fullContents.split(document.eol);
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const lineLength = lines[lineIndex].length + document.eol.length;
    if (position.line - 1 === lineIndex) {
      rangeStart = chars + position.column - 1;
    }
    if (position.endLine - 1 === lineIndex) {
      rangeEnd = chars + position.endColumn - 1;
      break;
    }
    chars += lineLength;
  }
  return new Range(rangeStart, rangeEnd);
}

export class Linter {
  private _issues = new IssueCollection();
  // note - the order of this should match that of _issues
  private _results = new Map<string, ESLint.LintResult>();
  private _processesForPaths: { [path: string]: Disposable | undefined } = {};

  lintDocument(document: TextDocument) {
    const contentRange = new Range(0, document.length);
    const content = document.getTextInRange(contentRange);
    this._processesForPaths[document.uri]?.dispose();
    this._processesForPaths[document.uri] = runEslint(
      content,
      document.isUntitled ? null : document.uri,
      document.syntax,
      (output) => {
        if (output instanceof Error) {
          throw output;
        }
        delete this._processesForPaths[document.uri];
        if (output.length !== 1) {
          console.warn(JSON.stringify(output));
          throw new Error("Unexpected results from linter");
        }
        const result = output[0];
        this._results.set(document.uri, result);
        this._issues.set(
          document.uri,
          result.messages.map(eslintOutputToIssue)
        );
      }
    );
  }

  async fixEditor(editor: TextEditor) {
    const [messages, issues] = this._getAllMessages(editor.document);
    const newIssues: Array<Issue> = [];
    await editor.edit((edit) => {
      messages
        .slice()
        .reverse()
        .forEach((message, i) => {
          if (message.fix) {
            const [start, end] = message.fix.range;
            const range = new Range(start, end);
            edit.replace(range, message.fix.text);
          } else {
            newIssues.push(issues[i]);
          }
        });
    });
    this._issues.set(editor.document.uri, newIssues);
  }

  removeIssues(uri: string) {
    const path = nova.path.normalize(uri);
    this._results.delete(path);
    this._issues.remove(path);
  }

  private _getAllMessages(
    document: TextDocument
  ): [ReadonlyArray<ESLintLinter.LintMessage>, ReadonlyArray<Issue>] {
    const result = this._results.get(document.uri);
    const issues = this._issues.get(document.uri);
    if (!result || result.messages.length != issues.length) {
      throw new Error("inconsistent data in Linter");
    }
    return [result.messages, issues];
  }

  getMessageAtSelection(
    editor: TextEditor
  ): ESLintLinter.LintMessage | undefined {
    const [messages, issues] = this._getAllMessages(editor.document);
    return messages.find((_, i) => {
      // annoyingly, nova doesn't provide a getter for this if col/line is set
      // const issueRange = issues[i].textRange!;
      const issue = issues[i];
      const position = {
        line: issue.line!,
        column: issue.column!,
        endLine: issue.endLine!,
        endColumn: issue.endColumn!,
      };
      const issueRange = positionToRange(editor.document, position);

      return (
        editor.selectedRange.intersectsRange(issueRange) ||
        (editor.selectedRange.empty &&
          issueRange.containsIndex(editor.selectedRange.start))
      );
    });
  }
}

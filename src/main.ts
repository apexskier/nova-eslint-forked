import { Linter } from "./linter";
import type { Rule } from "eslint";
import { fixEslint } from "./process";
import { shouldFixOnSave } from "./shouldFixOnSave";

const compositeDisposable = new CompositeDisposable();

// eslint-disable-next-line no-unused-vars
function fix(workspace: Workspace, editor: TextEditor): void;
// eslint-disable-next-line no-unused-vars
function fix(editor: TextEditor): void;
function fix(
    workspaceOrEditor: Workspace | TextEditor,
    maybeEditor?: TextEditor
): void {
    const editor = TextEditor.isTextEditor(workspaceOrEditor)
        ? workspaceOrEditor
        : maybeEditor!;
    if (editor.document.isDirty) {
        const listener = editor.onDidSave(() => {
            listener.dispose();
            innerFix();
        });
        editor.save();
    } else {
        innerFix();
    }

    function innerFix() {
        if (!editor.document.path) {
            nova.workspace.showErrorMessage("This document is missing a path.");
            return;
        }
        console.log("Fixing", editor.document.path);
        fixEslint(editor.document.path);
    }
}

export async function showChoicePalette<T>(
    choices: T[],
    // eslint-disable-next-line no-unused-vars
    choiceToString: (choice: T) => string,
    options?: { placeholder?: string }
) {
    const index = await new Promise<number | null>((resolve) =>
        nova.workspace.showChoicePalette(
            choices.map(choiceToString),
            options,
            (_, index) => {
                resolve(index);
            }
        )
    );
    if (index == null) {
        return null;
    }
    return choices[index];
}

export function activate() {
    console.log("activating...");

    const linter = new Linter();

    compositeDisposable.add(
        nova.commands.register("apexskier.eslint.command.fix", fix)
    );
    compositeDisposable.add(
        nova.commands.register(
            "apexskier.eslint.command.suggestForCursor",
            async (editor: TextEditor) => {
                const message = linter.getSuggestions(editor);

                console.log("message", JSON.stringify(message));
                if (!message?.fix && !message?.suggestions?.length) {
                    nova.workspace.showWarningMessage("No suggestions found");
                    return;
                }
                const choices: Array<{ title: string; fix: Rule.Fix }> = [];
                if (message.fix) {
                    choices.push({ title: "Fix", fix: message.fix });
                }
                if (message.suggestions) {
                    choices.push(
                        ...message.suggestions.map((suggestion) => ({
                            title: suggestion.desc,
                            fix: suggestion.fix,
                        }))
                    );
                }
                const choice = await showChoicePalette(
                    choices,
                    ({ title }) => title
                );
                if (choice) {
                    editor.edit((edit) => {
                        edit.replace(
                            new Range(choice.fix.range[0], choice.fix.range[1]),
                            choice.fix.text
                        );
                    });
                }
            }
        )
    );

    compositeDisposable.add(nova.workspace.onDidAddTextEditor(watchEditor));

    function watchEditor(editor: TextEditor) {
        const document = editor.document;

        if (document.isRemote) {
            // TODO: what to do...
            // return;
        }

        if (
            !["javascript", "typescript", "tsx", "jsx"].includes(
                document.syntax ?? ""
            )
        ) {
            return;
        }

        linter.lintDocument(document);

        const editorDisposable = new CompositeDisposable();

        editorDisposable.add(
            editor.onWillSave((editor) => {
                if (shouldFixOnSave()) {
                    const listener = editor.onDidSave((editor) => {
                        listener.dispose();
                        if (!editor.document.path) {
                            nova.workspace.showErrorMessage(
                                "This document is missing a path."
                            );
                            return;
                        }
                        nova.commands.invoke(
                            "apexskier.eslint.command.fix",
                            editor
                        );
                    });
                }
                linter.lintDocument(editor.document);
            })
        );
        editorDisposable.add(
            editor.onDidStopChanging((editor) =>
                linter.lintDocument(editor.document)
            )
        );
        editorDisposable.add(
            editor.onDidDestroy((destroyedEditor) => {
                const anotherEditor = nova.workspace.textEditors.find(
                    (editor) =>
                        editor.document.uri === destroyedEditor.document.uri
                );

                if (!anotherEditor) {
                    linter.removeIssues(destroyedEditor.document.uri);
                }
                editorDisposable.dispose();
            })
        );

        compositeDisposable.add(editorDisposable);

        compositeDisposable.add(
            document.onDidChangeSyntax((document) =>
                linter.lintDocument(document)
            )
        );
    }

    console.log("activated");
}

export function deactivate() {
    compositeDisposable.dispose();
}

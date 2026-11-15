# dsh-edit-message

A DeepSeek Harness plugin: edit one of your own messages and resend it — even while the agent is still answering.

## Install

```sh
dsh plugin --profile <profile> add dsh-edit-message
```

Or from the app: open **Plugins** > **Discover**, add the index source below, then **Edit and resend** > **Install**. Installing through Discover only adds the package — flip its switch on in **Installed** to activate it (the CLI route below enables it immediately). Remove it with `dsh plugin --profile <profile> remove dsh-edit-message`.

Requires DSH `>=0.2.2-rc.3`. Nothing is added on the Host: the bundle inserts one Client module and two slot entries.

Market index source (paste into **Discover** > **Add index source**):

```text
https://raw.githubusercontent.com/2648782102/dsh-edit-message/main/market/index.json
```

## Where it appears

Hover (or tab into) one of your own messages. A small pencil appears in the gutter to the right of the bubble, level with its top edge. It is invisible until the row is hovered, sits entirely outside the message so it never covers text, and is styled as a plain icon like the host's own copy control rather than a floating card.

## What confirming does

1. The conversation is forked at the `turn/end` of the turn before the edited message, so the new branch keeps everything that came before it.
2. The edited text is sent into the fork as a normal prompt.
3. The new branch opens once the message is sent, with the resent message already in it; the original conversation is left untouched.

## Editing while the reply is still streaming

The pencil is available as soon as the message is admitted, including while the agent is still answering. Confirming then:

1. stops the in-flight turn, so the abandoned answer stops consuming tokens;
2. creates the branch or Session described above;
3. sends the edited text there.

This is the interrupt-and-redo flow: the original conversation keeps the stopped turn, the new branch never saw it.

## Limits

- Only the **first** user message of a turn qualifies. Later messages in the same turn cannot be addressed without also discarding the earlier ones; the pencil is dimmed and names the reason.
- The **first** message of a conversation is resent into a **new Session** rather than a branch: a fork cannot cut before a turn's prompt, because that prompt lives in an `agent/inbox` event the seed would replay. The new Session keeps the source workspace, working directory, and agent preset.
- Messages containing **images, attachments, or references** are refused, because only plain text is re-sent. Hovering the dimmed pencil states which condition blocked the action.
- A failed send keeps the editor open with its text intact and reuses the branch or Session it already created, so pressing resend again does not stack duplicates.
- The action is hidden when the current peer lacks the `session/fork` permission.
- No agent tool or slash command is added: this is a user-only action.

## Requirements

The Client half needs the `sessions`, `uiConversation`, `slots`, and `locale` services. It registers two slots: `conversation.chat.user.before` (the pencil) and `shell.overlay` (the editor modal).

## Notes for contributors

This is a Client-only bundle. It deliberately avoids importing Host Client packages: the store, the modal, the focus handling, and the styles are local to `client.js`, and the interactive states use only `--dsw-alias-*` theme tokens.

Two Harness behaviours shaped the implementation and are worth knowing before changing it:

- A chain-slot entry must declare `select`; without it the whole entry silently fails to activate (`chain slot "…" requires options.select`).
- `ConversationLocation.turn` is the resolved `TurnLocation` record, not the turn number.
- A fork cut immediately before a turn's `turn/start` replays the original prompt from the preceding `agent/inbox` splice, which is why the first message takes the new-Session path instead.

## License

MIT

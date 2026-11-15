window.__ModuleLoader__.load({
  id: 'dsh-edit-message',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useRef } = React

    /** Locale namespace owned by this bundle. */
    const NS = 'edit-resend'

    const ZH = {
      'action.edit': '编辑并重发（新分支）',
      'action.unavailable.first': '首条消息无法重发：它之前没有可保留的对话',
      'action.editInterrupt': '编辑并重发（会停止当前回复）',
      'action.editFresh': '编辑并重发（新对话）',
      'action.unavailable.multiple': '同一轮中只能编辑第一条消息',
      'action.unavailable.content': '带图片、附件或引用的消息暂不支持编辑重发',
      'action.unavailable.missing': '找不到这条消息',
      'dialog.title': '编辑并重发',
      'dialog.hint': '将基于这条消息之前的内容创建一个新对话分支，并把修改后的消息发送到新分支。原对话保持不变。',
      'dialog.hintInterrupt': '当前回复会先停止，然后基于这条消息之前的内容创建新分支，并把修改后的消息发送过去。原对话保持不变。',
      'dialog.hintFresh': '这是对话的第一条消息，修改后的内容将发送到一个新对话（沿用当前工作区与预设）。原对话保持不变。',
      'dialog.hintFreshInterrupt': '当前回复会先停止，然后新建一个对话（沿用当前工作区与预设）并发送修改后的内容。原对话保持不变。',
      'dialog.send': '在新分支重发',
      'dialog.sendInterrupt': '停止并重发',
      'dialog.sendFresh': '新建并发送',
      'dialog.sending': '重发中…',
      'dialog.cancel': '取消',
      'dialog.empty': '消息不能为空。',
      'dialog.contentLabel': '消息内容',
      'dialog.failed': '重发失败',
    }

    const EN = {
      'action.edit': 'Edit and resend (new branch)',
      'action.unavailable.first': 'The first message cannot be resent: nothing precedes it',
      'action.editInterrupt': 'Edit and resend (stops the current reply)',
      'action.editFresh': 'Edit and resend (new chat)',
      'action.unavailable.multiple': 'Only the first message of a turn can be edited',
      'action.unavailable.content': 'Messages with images, attachments, or references cannot be resent yet',
      'action.unavailable.missing': 'This message could not be located',
      'dialog.title': 'Edit and resend',
      'dialog.hint': 'Creates a new conversation branch from the content before this message and sends the edited text there. The original conversation is left unchanged.',
      'dialog.hintInterrupt': 'The current reply stops first, then a new branch is created from the content before this message and the edited text is sent there. The original conversation is left unchanged.',
      'dialog.hintFresh': 'This is the first message of the conversation, so the edited text starts a new chat that keeps the current workspace and preset. The original conversation is left unchanged.',
      'dialog.hintFreshInterrupt': 'The current reply stops first, then the edited text starts a new chat that keeps the current workspace and preset. The original conversation is left unchanged.',
      'dialog.send': 'Resend in new branch',
      'dialog.sendInterrupt': 'Stop and resend',
      'dialog.sendFresh': 'Start new chat',
      'dialog.sending': 'Resending…',
      'dialog.cancel': 'Cancel',
      'dialog.empty': 'The message cannot be empty.',
      'dialog.contentLabel': 'Message content',
      'dialog.failed': 'Resend failed',
    }

    /** Minimal observable store; the Client bundle cannot import the Harness store package. */
    function createStore(initial) {
      let value = initial
      const listeners = new Set()
      return {
        getSnapshot: () => value,
        subscribe: (listener) => {
          listeners.add(listener)
          return () => { listeners.delete(listener) }
        },
        set: (next) => {
          if (next === value) return
          value = next
          for (const listener of [...listeners]) listener()
        },
      }
    }

    const CLOSED = { open: false, sessionId: '', text: '', kind: 'fork', cutSeq: 0, interrupt: false, childId: null, submitting: false, error: null }

    /** Chat snapshot stand-in used before a Session's view target publishes. */
    const EMPTY_SNAPSHOT = {
      nodes: { values: () => [], get: () => undefined },
      timeline: { turnOrder: [], turns: new Map() },
    }
    const EMPTY_SOURCE = { getSnapshot: () => EMPTY_SNAPSHOT, subscribe: () => () => {} }

    /** Owning turn number of one Chat node, whichever resolved location it carries. */
    function turnOf(node) {
      const location = node.location
      if (location === null || location === undefined) return undefined
      // `ConversationLocation.turn` is the resolved Turn record, not its number.
      const record = location.turn
      if (record === null || record === undefined) return undefined
      return typeof record.turn === 'number' ? record.turn : undefined
    }

    /** Plain text of a message whose blocks are all text; null otherwise. */
    function textOf(node) {
      const content = node.data.content
      if (!Array.isArray(content)) return null
      const parts = []
      for (const block of content) {
        if (block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string') {
          parts.push(block.text)
          continue
        }
        return null
      }
      return parts.join('')
    }

    /**
     * Resolve the durable user message a rendered row stands for. The chain
     * seat receives the row's own `source` object, which is the identity the
     * projection carries, so a reference comparison addresses the message.
     */
    function findUserNode(snapshot, source) {
      for (const node of snapshot.nodes.values()) {
        if (node.kind !== 'user') continue
        if (node.data.source === source) return node
      }
      return undefined
    }

    /** Host-typed reason strings the seat renders as a disabled tooltip. */
    const REASON_KEY = {
      first: 'action.unavailable.first',
      multiple: 'action.unavailable.multiple',
      content: 'action.unavailable.content',
      missing: 'action.unavailable.missing',
    }


    const PLUGIN_CSS = `
.er-seat { position: relative; display: flex; justify-content: flex-end; width: 100%; height: 0; }
.er-action {
  /* Outside the bubble, hard against its right edge and level with its top:
     a toolbar floating above the bubble lands under the sticky conversation
     header for the first row, and one inside the bubble covers the message
     text at the corner. The seat line sits one row gap above the bubble, so
     the top offset compensates for that gap. */
  position: absolute; left: calc(100% + 4px); top: 6px;
  display: inline-flex; align-items: center; justify-content: center;
  width: calc(20px + var(--dsh-content-font-delta, 0px));
  height: calc(20px + var(--dsh-content-font-delta, 0px));
  padding: 0; border: none; border-radius: var(--dsw-radius-sm);
  background: transparent; color: var(--dsw-alias-label-tertiary);
  opacity: 0; cursor: pointer;
  transition: opacity 100ms ease, background-color 120ms ease, color 120ms ease;
}
.er-action svg { width: calc(14px + var(--dsh-content-font-delta, 0px)); height: calc(14px + var(--dsh-content-font-delta, 0px)); }
[data-chat-flow-kind='user']:hover .er-action,
[data-chat-flow-kind='user']:focus-within .er-action,
.er-seat:hover .er-action,
.er-action:focus-visible { opacity: 1; }
@media (hover: hover) {
  .er-action:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); }
}
@media (hover: none) { .er-action { opacity: 0.75; } }
.er-action[data-unavailable] { opacity: 0.3; cursor: default; }
@media (hover: hover) { .er-action[data-unavailable]:hover { background: transparent; color: var(--dsw-alias-label-tertiary); } }

/* Immediate reason bubble: the native title tooltip is slow and never shows on
   keyboard focus, which is the only way to reach this seat without a pointer. */
.er-tip {
  position: absolute; right: 0; bottom: calc(100% + 6px);
  max-width: 260px; padding: 4px 8px;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-sm);
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: var(--dsw-shadow-lv3, 0 4px 12px rgb(0 0 0 / 0.16));
  color: var(--dsw-alias-label-secondary);
  font-size: 12px; line-height: 18px; font-weight: 400;
  white-space: normal; text-align: right;
  opacity: 0; pointer-events: none; transition: opacity 90ms ease;
}
.er-seat:hover .er-tip, .er-action:focus-visible + .er-tip { opacity: 1; }
@media (hover: none) { .er-tip { display: none; } }

.er-backdrop {
  position: fixed; inset: 0; z-index: 1200;
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
  background: var(--dsw-alias-bg-mask-1, rgb(0 0 0 / 0.32));
  backdrop-filter: var(--dsw-menu-backdrop-filter, none);
  overscroll-behavior: contain;
}
.er-dialog {
  display: flex; flex-direction: column; gap: 12px;
  width: min(560px, 100%); max-height: 100%; box-sizing: border-box;
  overflow-y: auto;
  padding: 20px;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-panel);
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: var(--dsw-shadow-lv3, 0 12px 40px rgb(0 0 0 / 0.18));
  color: var(--dsw-alias-label-primary);
}
.er-title { margin: 0; font-size: 15px; font-weight: 600; line-height: 22px; }
.er-hint { margin: 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.er-text {
  display: block; width: 100%; min-height: 120px; max-height: 46vh; box-sizing: border-box;
  padding: 12px 14px;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 14px; line-height: 22px;
  resize: none;
}
.er-text:focus {
  outline: none;
  border-color: var(--dsw-alias-border-l3);
  box-shadow: 0 0 0 1px var(--dsw-alias-state-business-primary);
}
/* Reserved slot: validating an empty message must not jump the dialog. */
.er-error { margin: 0; min-height: 20px; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-error); }
.er-footer { display: flex; justify-content: flex-end; gap: 8px; }
.er-btn {
  height: 32px; padding: 0 16px;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-lg);
  background: transparent; color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 13px; cursor: pointer;
  transition: background-color 120ms ease;
}
@media (hover: hover) { .er-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); } }
.er-btn:disabled { cursor: default; opacity: 0.5; }
.er-btn-primary {
  border-color: transparent;
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}
@media (hover: hover) { .er-btn-primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-fill); filter: brightness(1.06); } }
.er-btn:focus-visible, .er-action:focus-visible {
  outline: var(--dsw-focus-ring-width, 2px) solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary));
  outline-offset: 2px;
}
.er-sr {
  position: absolute; width: 1px; height: 1px; overflow: hidden;
  clip: rect(0 0 0 0); white-space: nowrap;
}
@media (prefers-reduced-motion: reduce) { .er-action, .er-btn, .er-tip { transition: none; } }
`

    /** Pencil glyph; inherits the button's color. */
    function PencilIcon() {
      return h('svg', { viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
        h('path', {
          d: 'M11.1 2.1a1.6 1.6 0 0 1 2.3 0l.5.5a1.6 1.6 0 0 1 0 2.3l-7.4 7.4-2.9.6.6-2.9 6.9-7.9Z',
          stroke: 'currentColor',
          strokeWidth: '1.2',
          strokeLinejoin: 'round',
        }),
        h('path', { d: 'M9.9 3.3 12.7 6.1', stroke: 'currentColor', strokeWidth: '1.2', strokeLinecap: 'round' }))
    }

    /**
     * Zero-height affordance in the message-source seat above one user bubble.
     * It stays invisible until the row is hovered or focused, so the transcript
     * keeps its host layout, and the button reports why it is unavailable
     * instead of disappearing.
     */
    function EditSeat(props) {
      const allowed = props.useAccess === undefined ? true : props.useAccess('session/fork')
      const usable = props.kind === 'user' && allowed && typeof props.resolve === 'function'
        && typeof props.useChat === 'function'
      // The hook runs every render so the seat repaints when the owning Turn
      // closes; an unusable seat still calls it to keep hook order stable.
      const snapshot = typeof props.useChat === 'function' ? props.useChat((value) => value) : undefined
      const tipId = React.useId()
      if (!usable) return null
      const resolved = props.resolve(snapshot, props.source)
      // Only reachable when the owning `turn/start` has scrolled out of the
      // loaded window, so no boundary can be addressed: omit the control
      // instead of explaining a condition the user cannot act on.
      if (!resolved.ok && resolved.reason === 'first') return null
      const reason = resolved.ok ? null : props.t(REASON_KEY[resolved.reason] ?? 'action.unavailable.missing')
      const label = !resolved.ok
        ? null
        : resolved.kind === 'fresh'
          ? props.t('action.editFresh')
          : props.t(resolved.interrupt === true ? 'action.editInterrupt' : 'action.edit')
      return h('div', { className: 'er-seat' },
        h('button', {
          type: 'button',
          className: 'er-action',
          'aria-label': reason ?? label,
          'aria-describedby': reason === null ? undefined : tipId,
          'aria-disabled': reason === null ? undefined : true,
          'data-unavailable': reason === null ? undefined : '',
          onClick: reason === null ? () => { props.openEditor(props.source) } : undefined,
        }, h(PencilIcon)),
        reason === null ? null : h('span', { className: 'er-tip', id: tipId, role: 'tooltip' }, reason))
    }

    /** Frame-wide editor modal; one instance serves every Session. */
    function EditDialog(props) {
      if (typeof props.useEditResend !== 'function') return null
      const state = props.useEditResend((value) => value)
      const field = useRef(null)
      const open = state.open
      useEffect(() => {
        if (!open) return undefined
        const node = field.current
        if (node !== null && node !== undefined) {
          node.focus()
          const end = node.value.length
          node.setSelectionRange(end, end)
        }
        const onKey = (event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            props.dismiss()
            return
          }
          // Chat composers send with Enter; a multi-line editor keeps Enter as
          // a newline and offers the submit gesture on the modifier instead.
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            props.submit()
          }
        }
        document.addEventListener('keydown', onKey, true)
        return () => { document.removeEventListener('keydown', onKey, true) }
      }, [open, props.dismiss, props.submit])
      const failure = state.error === null
        ? null
        : state.error === 'empty'
          ? props.t('dialog.empty')
          : props.t('dialog.failed')
      // Protocol detail stays reachable on hover instead of spelling transport
      // jargon at the user; the console keeps the full failure.
      const detail = state.error === null || state.error === 'empty' ? undefined : state.error
      return h(React.Fragment, null,
        h('style', null, PLUGIN_CSS),
        open
          ? h('div', {
            className: 'er-backdrop',
            onMouseDown: (event) => { if (event.target === event.currentTarget) props.dismiss() },
          }, h('div', {
            className: 'er-dialog',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-labelledby': 'er-dialog-title',
            'aria-describedby': 'er-dialog-hint',
            'aria-busy': state.submitting || undefined,
          },
          h('h2', { className: 'er-title', id: 'er-dialog-title' }, props.t('dialog.title')),
          h('p', { className: 'er-hint', id: 'er-dialog-hint' },
            props.t(state.kind === 'fresh'
              ? (state.interrupt ? 'dialog.hintFreshInterrupt' : 'dialog.hintFresh')
              : (state.interrupt ? 'dialog.hintInterrupt' : 'dialog.hint'))),
          h('span', { className: 'er-sr', id: 'er-dialog-field' }, props.t('dialog.contentLabel')),
          h('textarea', {
            ref: field,
            className: 'er-text',
            'aria-labelledby': 'er-dialog-field',
            'aria-invalid': state.error === 'empty' || undefined,
            value: state.text,
            readOnly: state.submitting,
            onChange: (event) => { props.edit(event.target.value) },
          }),
          h('p', {
            className: 'er-error',
            role: failure === null ? undefined : 'alert',
            title: detail,
          }, failure),
          h('div', { className: 'er-footer' },
            h('button', {
              type: 'button',
              className: 'er-btn',
              disabled: state.submitting,
              onClick: () => { props.dismiss() },
            }, props.t('dialog.cancel')),
            h('button', {
              type: 'button',
              className: 'er-btn er-btn-primary',
              disabled: state.submitting,
              onClick: () => { props.submit() },
            }, state.submitting
              ? props.t('dialog.sending')
              : props.t(state.kind === 'fresh'
                ? 'dialog.sendFresh'
                : (state.interrupt ? 'dialog.sendInterrupt' : 'dialog.send'))))))
          : null)
    }
    return {
      inject: ['slots', 'sessions', 'uiConversation', 'locale'],

      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'edit-resend: dictionaries')

        const dialog = createStore(CLOSED)
        let cacheSnapshot = null
        let cacheNodes = new Map()
        const indexOf = (snapshot) => {
          if (snapshot === cacheSnapshot) return cacheNodes
          const nodes = new Map()
          for (const node of snapshot.nodes.values()) {
            if (node.kind !== 'user') continue
            nodes.set(node.data.source, node)
          }
          cacheSnapshot = snapshot
          cacheNodes = nodes
          return nodes
        }

        /** The Chat view target of one rendered Session, or undefined while unavailable. */
        const targetOf = (sessionId) => {
          try {
            const binding = ctx.sessions.binding(sessionId)
            if (binding === undefined) return undefined
            const target = ctx.uiConversation.binding(binding).target('chat')
            return target === undefined || target === null ? undefined : target
          } catch (error) {
            return undefined
          }
        }

        /**
         * Stable observable of one Session's Chat snapshot for the seat's
         * `useChat` hook. The registration inject is cached per Session
         * binding, so one Session keeps one source.
         */
        const chatSourceOf = (sessionId) => {
          const target = targetOf(sessionId)
          if (target === undefined) return EMPTY_SOURCE
          return {
            getSnapshot: () => {
              const value = target.getSnapshot()
              return value === undefined || value === null ? EMPTY_SNAPSHOT : value
            },
            subscribe: (listener) => target.subscribe(listener),
          }
        }

        /** Everything the editor needs about one rendered row, or why it is unavailable. */
        const resolveFrom = (snapshot, source) => {
          if (snapshot === undefined || snapshot === null) return { ok: false, reason: 'missing' }
          let node
          try {
            node = indexOf(snapshot).get(source) ?? findUserNode(snapshot, source)
          } catch (error) {
            return { ok: false, reason: 'missing' }
          }
          if (node === undefined) return { ok: false, reason: 'missing' }
          const text = textOf(node)
          if (text === null) return { ok: false, reason: 'content' }
          const turn = turnOf(node)
          if (turn === undefined) return { ok: false, reason: 'missing' }
          const turns = snapshot.timeline.turns
          const own = turns.get(turn)
          if (own === undefined) return { ok: false, reason: 'missing' }
          let first = true
          for (const other of snapshot.nodes.values()) {
            if (other.kind !== 'user' || other === node) continue
            if (turnOf(other) === turn) { first = false; break }
          }
          if (!first) return { ok: false, reason: 'multiple' }
          const previous = turns.get(turn - 1)
          const previousEnd = previous === undefined ? undefined : previous.end
          // A running turn may be edited: the cut lands on the previous
          // completed turn, exactly like an edit after it finishes, and the
          // in-flight answer is interrupted rather than kept.
          //
          // The first turn of a conversation has no such boundary, and cutting
          // just before its own `turn/start` is not equivalent: the turn's
          // prompt sits in an `agent/inbox` splice ahead of that event, so the
          // seed would replay the original text into the new Session and answer
          // it. Editing the first message therefore starts a fresh Session in
          // the same Workspace instead of forking.
          const interrupt = own.end === undefined || own.end === null
          if (previousEnd !== undefined && previousEnd !== null) {
            return { ok: true, text, turn, interrupt, kind: 'fork', cutSeq: previousEnd.seq }
          }
          return { ok: true, text, turn, interrupt, kind: 'fresh' }
        }

        const openEditor = (sessionId, source) => {
          const resolved = resolveFrom(chatSourceOf(sessionId).getSnapshot(), source)
          if (!resolved.ok) return
          dialog.set({
            open: true,
            sessionId,
            text: resolved.text,
            kind: resolved.kind,
            cutSeq: resolved.cutSeq === undefined ? 0 : resolved.cutSeq,
            interrupt: resolved.interrupt,
            childId: null,
            submitting: false,
            error: null,
          })
        }

        const edit = (text) => {
          const current = dialog.getSnapshot()
          if (!current.open || current.submitting) return
          dialog.set({ ...current, text, error: null })
        }

        const dismiss = () => {
          if (dialog.getSnapshot().submitting) return
          dialog.set(CLOSED)
        }

        /** Send the edited text into the freshly forked child Session. */
        const promptChild = async (childId, text) => {
          const deliver = async (binding) => {
            const session = binding === undefined ? undefined : binding.session
            if (session === undefined) throw new Error('child session is not available')
            const result = await session.prompt([{ type: 'text', text }], 'queue')
            if (result !== undefined && result !== null && result.ok === false) {
              const error = result.error ?? {}
              throw new Error(error.message ?? error.code ?? 'prompt rejected')
            }
          }
          if (typeof ctx.sessions.using === 'function') {
            // A bare SessionId keeps the plain-Session prompt path; an object
            // target would be read as an addressed (subagent) generation.
            await ctx.sessions.using(childId, { source: 'editResend' }, async (reference) => {
              await reference.ready
              await deliver(reference.binding)
            })
            return
          }
          const reference = ctx.sessions.retain(childId, { source: 'editResend' })
          try {
            await reference.ready
            await deliver(reference.binding)
          } finally {
            reference.release()
          }
        }

        /**
         * Options for the fresh Session that replaces an edited first message.
         * It carries the source catalog row's workspace, working directory,
         * and Agent preset so the replacement lands where the original lived
         * instead of in Ungrouped under the Host default.
         */
        const freshSessionOptions = (sessionId) => {
          const options = {}
          const summary = ctx.sessions.list.getSnapshot().byId[sessionId]
          if (summary !== undefined && summary !== null) {
            if (summary.cwd !== undefined) options.cwd = summary.cwd
            const preset = summary.projectionValues === undefined
              ? undefined
              : summary.projectionValues.agentPreset
            if (typeof preset === 'string') options.agentPreset = preset
          }
          const workspaces = ctx.get('workspaces')
          if (workspaces !== undefined && workspaces !== null) {
            const state = workspaces.list.getSnapshot()
            const items = state === undefined || state.items === undefined ? [] : state.items
            for (const item of items) {
              if (Array.isArray(item.sessionIds) && item.sessionIds.includes(sessionId)) {
                options.workspaceId = item.workspaceId
                break
              }
            }
          }
          return options
        }

        const submit = async () => {
          const current = dialog.getSnapshot()
          if (!current.open || current.submitting) return
          const text = current.text.trim()
          if (text === '') {
            dialog.set({ ...current, error: 'empty' })
            return
          }
          dialog.set({ ...current, submitting: true, error: null })
          try {
            // Editing a reply that is still streaming: stop it first, so the
            // abandoned answer stops costing tokens and the source Settles
            // rather than running on behind a view nobody is watching. A stop
            // that fails (already finished, or dropped by the Host) is not a
            // reason to block the resend.
            if (current.interrupt && current.childId === null) {
              const source = ctx.sessions.binding(current.sessionId)
              const session = source === undefined ? undefined : source.session
              if (session !== undefined && typeof session.cancel === 'function') {
                try {
                  const stopped = await session.cancel()
                  if (stopped !== undefined && stopped !== null && stopped.ok === false) {
                    console.warn('edit-resend: stop before resend was refused —', stopped.error)
                  }
                } catch (error) {
                  console.warn('edit-resend: stop before resend failed —', error)
                }
              }
            }
            // A retry after a failed send reuses the conversation the first
            // attempt created, so repeated clicks never stack `(2)`, `(3)`…
            // forks or blank Sessions.
            let childId = current.childId
            if (childId === null) {
              childId = current.kind === 'fresh'
                ? await ctx.sessions.create(freshSessionOptions(current.sessionId))
                : await ctx.sessions.fork({
                  sessionId: current.sessionId,
                  atSeq: current.cutSeq,
                  increaseTitle: true,
                })
              dialog.set({ ...dialog.getSnapshot(), childId })
            }
            // Send before switching: the branch then opens with the resent
            // message already in it, and a failure keeps the editor in front
            // of the user instead of stranding them in an empty fork.
            await promptChild(childId, text)
            dialog.set(CLOSED)
            const workspace = ctx.get('uiWorkspace')
            if (workspace !== undefined && workspace !== null) workspace.openSession(childId)
          } catch (error) {
            const message = error !== null && error !== undefined && error.message !== undefined
              ? String(error.message)
              : String(error)
            console.warn('edit-resend: resend failed —', error)
            dialog.set({ ...dialog.getSnapshot(), submitting: false, error: message })
          }
        }

        ctx.slots.inject('conversation.chat.user.before', () => ctx.slots.register({
          name: 'conversation.chat.user.before',
          id: 'edit-resend',
          priority: 40,
          locale: NS,
          // A chain entry must route: claim the durable user row and decline
          // every other row kind.
          select: (owner) => (owner !== null && owner !== undefined && owner.kind === 'user' ? owner : null),
          inject: (sessionId) => ({
            hooks: { chat: chatSourceOf(sessionId) },
            resolve: (snapshot, source) => resolveFrom(snapshot, source),
            openEditor: (source) => { openEditor(sessionId, source) },
          }),
        }, EditSeat))

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'edit-resend-editor',
          locale: NS,
          inject: () => ({
            hooks: { editResend: dialog },
            edit,
            submit: () => { void submit() },
            dismiss,
          }),
        }, EditDialog))
      },
    }
  },
})

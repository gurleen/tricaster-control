import type { ShortcutSpecs } from './shortcuts.gen'
import type { DictValue, ShortcutSpec, TagValue, ValueTag } from './spec'

/** Any shortcut name defined in shortcuts_cfg.xml. */
export type ShortcutName = keyof ShortcutSpecs & string

type SpecOf<N extends ShortcutName> = ShortcutSpecs[N] extends ShortcutSpec ? ShortcutSpecs[N] : never

type ArgsFor<S extends ShortcutSpec> = S extends { d: infer D }
  ? S['v'] extends 'void'
    ? [dict?: DictValue<D>]
    : [value: TagValue<S['v']> | undefined, dict?: DictValue<D>]
  : S['v'] extends 'void'
    ? []
    : S['v'] extends 'unknown'
      ? [value?: TagValue<'unknown'>]
      : [value: TagValue<S['v']>]

/** Arguments accepted by `send(name, ...args)` for a given shortcut. */
export type ShortcutArgs<N extends ShortcutName> = ArgsFor<SpecOf<N>>

type StateTagValue<T extends ValueTag> = T extends 'ulong'
  ? bigint
  : T extends 'void'
    ? undefined
    : TagValue<T>

/** Parsed type of a shortcut's state value. */
export type ShortcutState<N extends ShortcutName> =
  SpecOf<N> extends { s: infer T extends ValueTag } ? StateTagValue<T> : string

/** Plain values the wire format can carry. */
export type WireValue = string | number | boolean | bigint

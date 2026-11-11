/** Type tags used in shortcuts_cfg.xml (`shortcut_type`, `state_type`, entry `type`). */
export type ValueTag =
  | 'void'
  | 'bool'
  | 'int'
  | 'long'
  | 'ulong'
  | 'double'
  | 'string'
  | 'dynamic'
  | 'unknown'

export interface ShortcutSpec {
  /** shortcut_type */
  v: ValueTag
  /** state_type */
  s?: ValueTag
  /** shortcut_dictionary entries */
  d?: Record<string, ValueTag>
  /** state_dictionary entries */
  sd?: Record<string, ValueTag>
}

/** Expands `prefix x suffix` into one object type keyed by full shortcut name. */
export type ExpandGroup<P extends string, S> = {
  [K in keyof S & string as `${P}${K}`]: S[K]
}

/** Maps a tag to the TS type accepted when sending. */
export type TagValue<T extends ValueTag> = T extends 'bool'
  ? boolean
  : T extends 'int' | 'double' | 'long'
    ? number
    : T extends 'ulong'
      ? number | bigint | string // 64-bit masks can exceed Number precision
      : T extends 'string'
        ? string
        : T extends 'dynamic' | 'unknown'
          ? string | number | boolean
          : never

export type DictValue<D> = {
  [K in keyof D]?: NonNullable<D[K]> extends ValueTag ? TagValue<NonNullable<D[K]>> : never
}

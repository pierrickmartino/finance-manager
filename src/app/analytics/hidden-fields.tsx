interface HiddenFieldsProps {
  /** What the form sends again as it is, one hidden field per parameter. */
  params: URLSearchParams;
}

/**
 * Search parameters a GET form on Analytics sends again unchanged, from the Period module's one
 * shape for them: the Period control's Card pins (`cardPeriodsToParams`), and a Card Period's
 * page with every other pin (`periodToParams`).
 */
export function HiddenFields({ params }: HiddenFieldsProps) {
  return [...params].map(([field, value]) => (
    <input key={field} type="hidden" name={field} value={value} />
  ));
}

/** The "Add existing Widget" picker on a Dashboard (GLOSSARY: Standalone Widget). */

export interface PickableWidget {
  id: string;
  name: string;
  /** null for a Standalone Widget. */
  dashboardId: string | null;
}

export interface PickableDashboard {
  id: string;
  name: string;
}

export interface WidgetPickerOption {
  id: string;
  label: string;
}

const NO_DASHBOARD = 'No Dashboard';

/**
 * Every Widget as a picker option, labelled with the Dashboard it sits on. Standalone Widgets
 * come first; each group keeps the given order.
 */
export function widgetPickerOptions(
  widgets: readonly PickableWidget[],
  dashboards: readonly PickableDashboard[],
): WidgetPickerOption[] {
  const dashboardNames = new Map(dashboards.map((dashboard) => [dashboard.id, dashboard.name]));
  const toOption = (widget: PickableWidget): WidgetPickerOption => {
    const place = widget.dashboardId ? dashboardNames.get(widget.dashboardId) : NO_DASHBOARD;
    return { id: widget.id, label: `${widget.name} (${place ?? NO_DASHBOARD})` };
  };
  return [
    ...widgets.filter((widget) => widget.dashboardId === null),
    ...widgets.filter((widget) => widget.dashboardId !== null),
  ].map(toOption);
}

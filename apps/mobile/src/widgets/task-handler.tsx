import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { widgetData } from './data';
import { WIDGETS, type WidgetName } from './widgets';

/** Headless task: renders widgets on add/update/resize (every 30 min via updatePeriodMillis). */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const name = props.widgetInfo.widgetName as WidgetName;
  const Comp = WIDGETS[name];
  if (!Comp) return;
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
    case 'WIDGET_CLICK':
      props.renderWidget(<Comp data={widgetData()} />);
      break;
    default:
      break;
  }
}

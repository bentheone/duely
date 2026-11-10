"use no memo";

import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { widgetData } from './data';
import { FallbackWidget, WIDGETS, type WidgetName } from './widgets';

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
      try {
        props.renderWidget(<Comp data={widgetData()} />);
      } catch (e) {
        // Never leave the widget blank: show a tappable placeholder instead.
        console.error('[duely-widget]', name, (e as Error).message);
        props.renderWidget(<FallbackWidget />);
      }
      break;
    default:
      break;
  }
}

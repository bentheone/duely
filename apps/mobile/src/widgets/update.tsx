import React from 'react';
import { Platform } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { widgetData } from './data';
import { WIDGETS, type WidgetName } from './widgets';

/** Refresh every widget instance after data changes (the 30-min refresh comes from updatePeriodMillis). */
export async function updateAllWidgets(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const data = widgetData();
  for (const name of Object.keys(WIDGETS) as WidgetName[]) {
    const Comp = WIDGETS[name];
    await requestWidgetUpdate({ widgetName: name, renderWidget: () => <Comp data={data} />, widgetNotFound: () => undefined });
  }
}

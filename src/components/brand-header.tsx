import * as React from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';

type BrandHeaderProps = {
  section: string;
  title: string;
  description?: string;
  note?: string;
  sectionColor?: string;
  titleColor?: string;
  bodyColor?: string;
};

export default function BrandHeader({
  section,
  title,
  description,
  note,
  sectionColor = '#B71C1C',
  titleColor = '#0f172a',
  bodyColor = '#64748b',
}: BrandHeaderProps) {
  return (
    <View style={styles.wrap}>
      <Image source={require('../../assets/images/icon.png')} style={styles.icon} resizeMode="contain" />
      <View style={styles.copy}>
        <ThemedText type="small" style={[styles.section, { color: sectionColor }]}>ONE</ThemedText>
        <ThemedText type="title" style={[styles.title, { color: titleColor }]}>{title}</ThemedText>
        {description ? <ThemedText style={[styles.description, { color: bodyColor }]}>{description}</ThemedText> : null}
        <ThemedText style={[styles.note, { color: bodyColor }]}>{section}</ThemedText>
        {note ? <ThemedText style={[styles.note, { color: bodyColor }]}>{note}</ThemedText> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  icon: {
    width: 54,
    height: 54,
    borderRadius: 14,
    backgroundColor: '#ffffff',
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  section: {
    letterSpacing: 2.2,
    fontWeight: '800',
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
  },
  description: {
    lineHeight: 19,
    fontWeight: '700',
  },
  note: {
    lineHeight: 18,
  },
});

import type { Card, CardKind } from "@pro-gyakuten/protocol";

const KIND_NAMES: Record<CardKind, string> = {
  number: "",
  skip: "禁",
  reverse: "反转",
  draw_two: "+2",
  wild: "变色",
  wild_draw_four: "+4"
};

export function cardText(card: Card): string {
  if (card.kind === "number") return String(card.value);
  return KIND_NAMES[card.kind];
}

export function cardFace(card: Card): string {
  return card.kind === "number" ? String(card.value) : cardText(card);
}

const CORNER_NAMES: Record<CardKind, string> = {
  number: "",
  skip: "⊘",
  reverse: "⟲",
  draw_two: "+2",
  wild: "变",
  wild_draw_four: "+4"
};

export function cardCornerText(card: Card): string {
  if (card.kind === "number") return String(card.value);
  return CORNER_NAMES[card.kind];
}

export const COLOR_HEX: Record<string, string> = {
  red: "#e74c3c",
  yellow: "#f1c40f",
  blue: "#3498db",
  green: "#2ecc71",
  wild: "#2c3e50"
};

export function cardColorClass(card: Card): string {
  return card.color;
}

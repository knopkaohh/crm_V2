/** Значение select «Другое» — фактический материал в materialOther */
export const MATERIAL_OTHER = 'Другое'

export const ORDER_MATERIAL_OPTIONS = [
  'Сатин классический',
  'Сатин премиум',
  'Силикон',
  'Жаккард',
  'Картонная навесная бирка',
  'Хлопок',
  'Нейлон',
  'ДТФ наклейки',
  'Флекстран',
  'ZIP-Lock пакет',
  'ПВХ Патч',
  'Разработка макетов',
  MATERIAL_OTHER,
] as const

export type OrderMaterialOption = (typeof ORDER_MATERIAL_OPTIONS)[number]

export function resolveOrderMaterial(material: string, materialOther: string): string {
  if (material === MATERIAL_OTHER) {
    return materialOther.trim() || MATERIAL_OTHER
  }
  return material
}

export function isDesignOnlyMaterial(material: string): boolean {
  return material === 'Разработка макетов'
}

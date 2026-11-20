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
  'ПВД Пакеты',
  'Бумажные пакеты',
  'Листовки',
  'Буклеты',
  'Пуллеры',
  'Стикеры',
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

/** Белый / чёрный / свой цвет. Свой цвет пишется в соседнее текстовое поле. */
export const OTHER_COLOR_OPTIONS = ['Белый', 'Черный', 'Другой'] as const

export const BAG_HANDLE_OPTIONS = ['Репс', 'Шнур'] as const

export const PULLER_BASE_OPTIONS = ['Жаккард', 'ПВХ'] as const

export const STICKER_BASE_OPTIONS = ['Бумага', 'Плёнка', 'Прозрачная'] as const

export const STICKER_SHAPE_OPTIONS = ['Прямоугольник', 'Круг', 'Фигурная'] as const

export const STICKER_PRINT_OPTIONS = ['Белый', 'Черный', 'Полноцвет', 'Другой'] as const

export const STICKER_LAMINATION_OPTIONS = ['Нет', 'Глянцевая', 'Матовая'] as const

const TEXTILE_MATERIALS = [
  'Сатин классический',
  'Сатин премиум',
  'Силикон',
  'Хлопок',
  'Нейлон',
  'ДТФ наклейки',
  'Флекстран',
]

const ITEM_NAME_MATERIALS = [
  ...TEXTILE_MATERIALS,
  'Жаккард',
  'Картонная навесная бирка',
  'ZIP-Lock пакет',
  'ПВХ Патч',
  'ПВД Пакеты',
  'Бумажные пакеты',
  'Листовки',
  'Буклеты',
  'Пуллеры',
  'Стикеры',
].sort((a, b) => b.length - a.length)

export type ProductionFormKind =
  | 'textile'
  | 'jacquard'
  | 'cardboard'
  | 'pvd-bag'
  | 'paper-bag'
  | 'puller'
  | 'sticker'
  | 'ziplock'
  | 'none'

export function materialFromItemName(itemName: string): string {
  for (const material of ITEM_NAME_MATERIALS) {
    if (itemName.includes(material)) {
      if (material === 'Картонная навесная бирка') return 'Картон'
      return material
    }
  }
  return ''
}

export function resolveProductionMaterial(item: { name?: string | null; material?: string | null }): string {
  const fromName = materialFromItemName(item.name || '')
  if (fromName) return fromName
  const stored = (item.material || '').trim()
  if (stored === 'Картонная навесная бирка') return 'Картон'
  return stored
}

export function productionFormKind(material: string): ProductionFormKind {
  if (TEXTILE_MATERIALS.includes(material)) return 'textile'
  if (material === 'Жаккард') return 'jacquard'
  if (material === 'Картон' || material === 'Картонная навесная бирка' || material === 'Листовки' || material === 'Буклеты') {
    return 'cardboard'
  }
  if (material === 'ПВД Пакеты') return 'pvd-bag'
  if (material === 'Бумажные пакеты') return 'paper-bag'
  if (material === 'Пуллеры') return 'puller'
  if (material === 'Стикеры') return 'sticker'
  if (material === 'ZIP-Lock пакет') return 'ziplock'
  return 'none'
}

export interface ProductionParamInput {
  baseColor?: string
  baseColorCustom?: string
  printColor?: string
  printColorCustom?: string
  cutting?: boolean
  centerFold?: boolean
  freeEdge?: boolean
  postProcessing?: string[]
  coating?: string[]
  singleSidedPrint?: boolean
  doubleSidedPrint?: boolean
  density?: string
  bagColor?: string
  bagColorCustom?: string
  sliderColor?: string
  foiling?: string
  handles?: string
  productBase?: string
  stickerShape?: string
  lamination?: string
}

export interface ProductionParamFields {
  baseColor: string | null
  baseColorCustom: string | null
  printColor: string | null
  printColorCustom: string | null
  cutting: string | null
  centerFold: string | null
  freeEdge: string | null
  postProcessing: string | null
  coating: string | null
  singleSidedPrint: boolean | null
  doubleSidedPrint: boolean | null
  density: string | null
  bagColor: string | null
  sliderColor: string | null
  foiling: string | null
  handles: string | null
  productBase: string | null
  stickerShape: string | null
  lamination: string | null
}

function emptyProductionFields(): ProductionParamFields {
  return {
    baseColor: null,
    baseColorCustom: null,
    printColor: null,
    printColorCustom: null,
    cutting: null,
    centerFold: null,
    freeEdge: null,
    postProcessing: null,
    coating: null,
    singleSidedPrint: null,
    doubleSidedPrint: null,
    density: null,
    bagColor: null,
    sliderColor: null,
    foiling: null,
    handles: null,
    productBase: null,
    stickerShape: null,
    lamination: null,
  }
}

function selectedColor(value: string | undefined, custom: string | undefined, customOption: string) {
  return {
    value: value || null,
    custom: value === customOption ? custom || null : null,
  }
}

/** Поля позиции, которые уходят в базу при отправке в работу. Чужие параметры обнуляются. */
export function productionParamFields(material: string, params: ProductionParamInput): ProductionParamFields {
  const fields = emptyProductionFields()
  const kind = productionFormKind(material)

  if (kind === 'textile' || kind === 'jacquard') {
    const base = selectedColor(params.baseColor, params.baseColorCustom, 'Цветной')
    const print = selectedColor(params.printColor, params.printColorCustom, 'Цветной')
    fields.baseColor = base.value
    fields.baseColorCustom = base.custom
    fields.printColor = print.value
    fields.printColorCustom = print.custom
    if (kind === 'jacquard') {
      fields.centerFold = params.centerFold ? 'Да' : 'Нет'
      fields.freeEdge = params.freeEdge ? 'Да' : 'Нет'
    } else {
      fields.cutting = params.cutting ? 'Да' : 'Нет'
    }
    return fields
  }

  if (kind === 'cardboard') {
    fields.postProcessing = params.postProcessing && params.postProcessing.length > 0 ? params.postProcessing.join(', ') : null
    fields.coating = params.coating && params.coating.length > 0 ? params.coating.join(', ') : null
    fields.singleSidedPrint = params.singleSidedPrint === true
    fields.doubleSidedPrint = params.doubleSidedPrint === true
    return fields
  }

  if (kind === 'pvd-bag' || kind === 'paper-bag') {
    const base = selectedColor(params.baseColor, params.baseColorCustom, 'Другой')
    const print = selectedColor(params.printColor, params.printColorCustom, 'Другой')
    fields.baseColor = base.value
    fields.baseColorCustom = base.custom
    fields.printColor = print.value
    fields.printColorCustom = print.custom
    if (kind === 'paper-bag') {
      fields.foiling = params.foiling || null
      fields.handles = params.handles || null
    }
    return fields
  }

  if (kind === 'puller') {
    fields.productBase = params.productBase || null
    return fields
  }

  if (kind === 'sticker') {
    const print = selectedColor(params.printColor, params.printColorCustom, 'Другой')
    fields.productBase = params.productBase || null
    fields.stickerShape = params.stickerShape || null
    fields.printColor = print.value
    fields.printColorCustom = print.custom
    fields.lamination = params.lamination || null
    return fields
  }

  if (kind === 'ziplock') {
    const print = selectedColor(params.printColor, params.printColorCustom, 'Другой')
    fields.density = params.density || null
    fields.bagColor = params.bagColor === 'Другой' ? params.bagColorCustom || null : params.bagColor || null
    fields.sliderColor = params.sliderColor || null
    fields.printColor = print.value
    fields.printColorCustom = print.custom
    return fields
  }

  return fields
}

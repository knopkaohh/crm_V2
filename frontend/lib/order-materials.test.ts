import assert from 'assert'
import {
  materialFromItemName,
  productionFormKind,
  productionParamFields,
  resolveProductionMaterial,
} from './order-materials'

assert.equal(materialFromItemName('Картонная навесная бирка 50x90'), 'Картон')
assert.equal(materialFromItemName('Листовки A5'), 'Листовки')
assert.equal(materialFromItemName('Буклеты евро'), 'Буклеты')
assert.equal(materialFromItemName('ПВД Пакеты 30x40'), 'ПВД Пакеты')
assert.equal(materialFromItemName('Бумажные пакеты 20x25'), 'Бумажные пакеты')
assert.equal(materialFromItemName('Пуллеры логотип'), 'Пуллеры')
assert.equal(materialFromItemName('Стикеры круг 5см'), 'Стикеры')
assert.equal(resolveProductionMaterial({ name: '', material: 'Картонная навесная бирка' }), 'Картон')

assert.equal(productionFormKind('Листовки'), 'cardboard')
assert.equal(productionFormKind('Буклеты'), 'cardboard')
assert.equal(productionFormKind('Картон'), 'cardboard')
assert.equal(productionFormKind('ПВД Пакеты'), 'pvd-bag')
assert.equal(productionFormKind('Сатин классический'), 'textile')

const pvd = productionParamFields('ПВД Пакеты', {
  baseColor: 'Другой',
  baseColorCustom: 'синий',
  printColor: 'Черный',
})
assert.equal(pvd.baseColor, 'Другой')
assert.equal(pvd.baseColorCustom, 'синий')
assert.equal(pvd.printColor, 'Черный')
assert.equal(pvd.printColorCustom, null)
assert.equal(pvd.foiling, null)
assert.equal(pvd.cutting, null)

const paper = productionParamFields('Бумажные пакеты', {
  baseColor: 'Белый',
  printColor: 'Другой',
  printColorCustom: 'золото',
  foiling: 'Да',
  handles: 'Репс',
})
assert.equal(paper.foiling, 'Да')
assert.equal(paper.handles, 'Репс')
assert.equal(paper.printColorCustom, 'золото')
assert.equal(paper.postProcessing, null)

const flyer = productionParamFields('Листовки', {
  postProcessing: ['Скругление углов'],
  coating: ['Фольгирование', 'Soft-touch'],
  singleSidedPrint: true,
  doubleSidedPrint: false,
})
assert.equal(flyer.postProcessing, 'Скругление углов')
assert.equal(flyer.coating, 'Фольгирование, Soft-touch')
assert.equal(flyer.singleSidedPrint, true)
assert.equal(flyer.doubleSidedPrint, false)
assert.equal(flyer.baseColor, null)

const booklet = productionParamFields('Буклеты', {
  coating: ['Оффсет'],
  doubleSidedPrint: true,
})
assert.equal(booklet.coating, 'Оффсет')
assert.equal(booklet.doubleSidedPrint, true)

const puller = productionParamFields('Пуллеры', { productBase: 'ПВХ' })
assert.equal(puller.productBase, 'ПВХ')
assert.equal(puller.printColor, null)

const sticker = productionParamFields('Стикеры', {
  productBase: 'Плёнка',
  stickerShape: 'Круг',
  printColor: 'Полноцвет',
  lamination: 'Матовая',
})
assert.equal(sticker.productBase, 'Плёнка')
assert.equal(sticker.stickerShape, 'Круг')
assert.equal(sticker.printColor, 'Полноцвет')
assert.equal(sticker.lamination, 'Матовая')
assert.equal(sticker.handles, null)

const satin = productionParamFields('Сатин классический', {
  baseColor: 'Белый',
  printColor: 'Черный',
  cutting: true,
  foiling: 'Да',
})
assert.equal(satin.cutting, 'Да')
assert.equal(satin.foiling, null)
assert.equal(satin.centerFold, null)

console.log('order-materials.test.ts: ok')

const { SVGGenerator } = require('./dist/generator.js');

async function testItemGeneration() {
  const generator = new SVGGenerator();
  
  try {
    console.log('Тестирование генерации предметов...');
    
    // Тест 1: Генерация оружия
    console.log('\n1. Генерация меча...');
    const swordResult = await generator.generateCompleteImage({
      description: 'стальной меч с узорчатым эфесом',
      type: 'item',
      fileName: 'sword_test',
      outputDir: './output/test-items'
    });
    console.log('Меч сохранен:', swordResult.svgPath);
    
    // Тест 2: Генерация сундука
    console.log('\n2. Генерация сундука...');
    const chestResult = await generator.generateCompleteImage({
      description: 'деревянный сундук с железными набойками',
      type: 'item',
      fileName: 'chest_test',
      outputDir: './output/test-items'
    });
    console.log('Сундук сохранен:', chestResult.svgPath);
    
    // Тест 3: Генерация кружки
    console.log('\n3. Генерация кружки...');
    const mugResult = await generator.generateCompleteImage({
      description: 'керамическая кружка с ручкой',
      type: 'item',
      fileName: 'mug_test',
      outputDir: './output/test-items'
    });
    console.log('Кружка сохранена:', mugResult.svgPath);
    
    // Тест 4: Генерация овоща
    console.log('\n4. Генерация моркови...');
    const carrotResult = await generator.generateCompleteImage({
      description: 'свежая морковь с зелеными листьями',
      type: 'item',
      fileName: 'carrot_test',
      outputDir: './output/test-items'
    });
    console.log('Морковь сохранена:', carrotResult.svgPath);
    
    console.log('\n✓ Все тесты завершены успешно!');
    console.log('Результаты находятся в папке ./output/test-items/');
    
  } catch (error) {
    console.error('Ошибка при генерации:', error);
  }
}

testItemGeneration();
const { SVGGenerator } = require('./dist/generator.js');

async function testCompositeGeneration() {
  const generator = new SVGGenerator();
  
  try {
    console.log('Testing composite generation...');
    
    // Test 1: Complex Scene
    console.log('\n1. Generating complex scene (Castle)...');
    const castleResult = await generator.generateCompleteImage({
      description: 'A magnificent medieval castle on a high hill, detailed stone walls, towers with flags, a small village at the bottom of the hill. Sunset lighting.',
      type: 'plot_view',
      mode: 'scene',
      composite: true,
      fileName: 'castle_composite_test',
      outputDir: './output/test-composite'
    });
    console.log('Castle saved:', castleResult.svgPath);
    console.log('SVG Length:', castleResult.svgCode.length);

    // Test 2: Simple Item (Comparison)
    console.log('\n2. Generating simple item (Apple)...');
    const appleResult = await generator.generateCompleteImage({
      description: 'A fresh green apple with a leaf.',
      type: 'item',
      fileName: 'apple_test',
      outputDir: './output/test-composite'
    });
    console.log('Apple saved:', appleResult.svgPath);
    console.log('SVG Length:', appleResult.svgCode.length);
    
    console.log('\n✓ Tests completed!');
    
  } catch (error) {
    console.error('Error during generation:', error);
  }
}

testCompositeGeneration();

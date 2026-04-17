const BOOKS = {
  selva_acuarela: {
    id: 'selva_acuarela',
    title: '[NOMBRE] y la Selva Magica',
    style: 'watercolor',
    loraKey: 'selva_acuarela',
    ageRange: '2-6',
    previewPages: [1, 3, 5, 8],
    stylePrompt: [
      'ESTILO_01', 'children book watercolor illustration',
      'soft hand-painted textures',
      'warm golden palette',
      'white paper grain visible',
      'clean white border',
      'gentle brush strokes',
      'no photorealism',
      'no 3d render',
      'storybook art',
    ].join(', '),
    negativePrompt: [
      'realistic', 'photograph', '3d render', 'cgi', 'ugly',
      'deformed', 'extra limbs', 'blurry', 'text', 'watermark',
      'logo', 'signature', 'inconsistent style', 'dark', 'scary',
      'adult content', 'violence',
    ].join(', '),
    pages: [
      { num: 1, scene: 'portada', seed: 42001, text: '[NOMBRE] y la Selva Magica', promptScene: 'brave child explorer [CHILD_DESC] wearing khaki explorer vest and red boots, standing confidently at the edge of a magical jungle, giant colorful tropical flowers, toucans and butterflies surrounding the child, warm golden light filtering through trees, sense of wonder and adventure' },
      { num: 2, scene: 'la_mochila', seed: 42002, text: 'Una manana, [NOMBRE] encontro en su cuarto una mochila verde con una nota.', promptScene: 'child [CHILD_DESC] sitting on bedroom floor, holding a magical glowing green backpack with a small note attached, cozy warm bedroom, morning light, toys scattered around, surprised and delighted expression' },
      { num: 3, scene: 'la_selva_aparece', seed: 42003, text: 'Al ponerse la mochila, zas! Su habitacion desaparecio y [NOMBRE] se encontro en medio de una selva enorme y colorida.', promptScene: 'child [CHILD_DESC] wearing green backpack, surrounded by magical swirling transformation, bedroom dissolving into lush jungle, giant tropical leaves, fireflies, magical sparkles, sense of wonder and excitement' },
      { num: 4, scene: 'leo_leopardo', seed: 42004, text: 'Un leopardo pequeno llamado Leo lloraba bajo un arbol.', promptScene: 'child [CHILD_DESC] kneeling gently next to a small crying baby leopard sitting under a jungle tree, child carefully helping remove a thorn from the leopard paw, warm afternoon jungle light, lush green leaves, tender and caring mood' },
      { num: 5, scene: 'mia_monita', seed: 42005, text: 'Mas adelante, Mia la monita estaba atrapada en una rama muy alta.', promptScene: 'child [CHILD_DESC] standing below a tall jungle tree, holding a rope, helping a small scared monkey safely descend from a high branch, dappled sunlight through jungle canopy, friendly determined expression' },
      { num: 6, scene: 'el_rio', seed: 42006, text: 'De repente, un rio enorme les corto el camino.', promptScene: 'child [CHILD_DESC] standing at the edge of a wide sparkling jungle river looking thoughtful and brave, baby leopard and small monkey standing beside the child looking nervous, golden hour light reflecting on water' },
      { num: 7, scene: 'el_puente', seed: 42007, text: '[NOMBRE] tuvo una idea: usar las lianas para hacer un puente.', promptScene: 'child [CHILD_DESC] working together with a baby leopard and small monkey to build a liana vine bridge over a jungle river, all three characters actively helping, joyful teamwork scene, bright warm colors, tropical setting' },
      { num: 8, scene: 'al_otro_lado', seed: 42008, text: 'Los tres cruzaron el rio bailando de alegria.', promptScene: 'child [CHILD_DESC] jumping with arms raised in celebration in a beautiful jungle clearing full of colorful wildflowers, baby leopard and monkey jumping alongside, all three celebrating together, radiant warm sunset light, joyful and triumphant mood' },
      { num: 9, scene: 'la_fiesta', seed: 42009, text: 'Todos los animales de la selva llegaron a celebrar.', promptScene: 'child [CHILD_DESC] at the center of a joyful jungle celebration surrounded by many friendly animals, elephants, toucans, turtles, butterflies and monkeys all dancing and celebrating around the child, magical festive jungle atmosphere, fireflies glowing' },
      { num: 10, scene: 'el_regalo', seed: 42010, text: 'Leo le regalo una pluma de tucan. Mia le dio una flor magica.', promptScene: 'child [CHILD_DESC] receiving a glowing toucan feather from baby leopard and a magical flower from monkey, face full of gratitude and love, warm jungle twilight, magical glow on the gifts, emotional and tender scene' },
      { num: 11, scene: 'camino_a_casa', seed: 42011, text: 'La mochila brillo de nuevo. Era hora de volver.', promptScene: 'child [CHILD_DESC] giving a big warm hug to baby leopard and monkey, green backpack glowing softly, magical transformation beginning, bittersweet farewell scene, warm jungle sunset, love and friendship' },
      { num: 12, scene: 'de_vuelta', seed: 42012, text: '[NOMBRE] aparecio de nuevo en su cuarto. Porque los exploradores valientes nunca paran de sonar.', promptScene: 'child [CHILD_DESC] tucked in bed in cozy bedroom, holding a toucan feather and magical flower, smiling peacefully drifting off to sleep, stars visible through bedroom window, small jungle animals visible in dream cloud above, warm nighttime light, peaceful and magical ending' },
    ],
  },
};

module.exports = { BOOKS };

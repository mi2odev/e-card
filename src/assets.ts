import type { ImageSourcePropType } from 'react-native';
import type { CardType } from './game/logic';

// Drop replacement artwork straight over these files — same names, same paths.
export const CARD_ART: Record<CardType, ImageSourcePropType> = {
  E: require('../assets/cards/emperor.png'),
  C: require('../assets/cards/citizen.png'),
  S: require('../assets/cards/slave.png'),
};

export const CARD_BACK: ImageSourcePropType = require('../assets/cards/card-back.png');

export const SEAL: Record<'emp' | 'slv', ImageSourcePropType> = {
  emp: require('../assets/seals/seal-emperor.png'),
  slv: require('../assets/seals/seal-slave.png'),
};

/** The picture on the credits — the same rule: drop your own straight over it. */
export const AUTHOR_PORTRAIT: ImageSourcePropType = require('../assets/credits/author.png');

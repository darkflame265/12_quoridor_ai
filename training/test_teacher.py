import unittest
import numpy as np
from teacher import mirror,outcome,split_data

class TeacherTests(unittest.TestCase):
    def test_mirror_preserves_move_wall_axes_and_is_involution(self):
        x=np.arange(292,dtype=np.float32); mask=np.zeros(209,dtype=np.bool_); mask[[0,80,81,144,145,208]]=True
        for a,expected in [(0,8),(80,72),(81,88),(144,137),(145,152),(208,201)]:
            y,b,m=mirror(x,a,mask); z,c,n=mirror(y,b,m)
            self.assertEqual(b,expected); self.assertEqual(c,a); np.testing.assert_array_equal(z,x); np.testing.assert_array_equal(n,mask); np.testing.assert_array_equal(y[290:],x[290:])
            self.assertEqual(int(m.sum()),int(mask.sum()))

    def test_outcome_changes_sign_with_side_and_draw_is_zero(self):
        self.assertEqual(outcome(0,0),1); self.assertEqual(outcome(0,1),-1); self.assertEqual(outcome(None,0),0)

    def test_game_and_mirror_leakage_removed_from_both_training_variants(self):
        groups=[]; mask=np.ones(209,dtype=np.bool_)
        common=np.zeros(292,dtype=np.float32); common[0]=1
        for i in range(8):
            x=np.zeros(292,dtype=np.float32); x[i+10]=1
            groups.append({'id':i,'suite':'general' if i<4 else 'maze','rows':[(x,0,mask,0.,0.),(common,0,mask,1.,1.)]})
        train,held,meta=split_data(groups,17,.25)
        reserved={x.tobytes() for r in held for x in [r[0],mirror(r[0],r[1],r[2])[0]]}
        self.assertEqual(len(meta['validationGames']),2); self.assertGreater(meta['excludedOverlappingStates'],0); self.assertEqual(meta['mirrorAwareOverlap'],0)
        self.assertTrue(all(r[0].tobytes() not in reserved for r in train)); self.assertTrue(all(r[2][r[1]] for r in train))
        again=split_data(groups,17,.25); self.assertEqual(again[2],meta)

    def test_incomplete_suite_cannot_silently_remove_validation(self):
        with self.assertRaises(ValueError): split_data([],1,.2)

if __name__=='__main__': unittest.main()

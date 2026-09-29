from src.data import load_dataset

def test_domains_are_unique_and_splits_can_be_disjoint():
    frame = load_dataset(per_family=30)
    assert frame.domain.is_unique
    assert not set(frame.loc[frame.label == 0, 'domain']) & set(frame.loc[frame.label == 1, 'domain'])

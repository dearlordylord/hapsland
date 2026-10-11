import Base

# Ordered serializable artifact values shared by graph products and prepared inputs.
# Mechanical representation only; producer schemas and policy stay with their owners.
type Binary64 is Data:
  Binary64{high: U32, low: U32}

# Ordered product data, not a host graph-building command.
# This generic transport tree requires product-shape validation; it is not a ReviewUnit by type alone.
type OrderedField<-Value: Data> is Data:
  OrderedField{key: String, value: Value}

type ProductValue is Data:
  ProductNull{}
  ProductBool{value: Bool}
  ProductNumber{bits: Binary64}
  ProductText{value: String}
  ProductArray{items: List<&2, ProductValue>}
  ProductObject{fields: List<&2, OrderedField<ProductValue>>}

```
Section MySection.

Variable A : Type.
Hypothesis h : A.

Definition pick : A := h.

End MySection.
```

Section 结束后，这个 Definition 在概念上相当于：

```
Definition pick (A : Type) (h : A) : A := h.
```

因此，`A`、`h` 都变成了 Definition 的参数，正常通过 `Prod`、`Lambda`、`Rel` 翻译。
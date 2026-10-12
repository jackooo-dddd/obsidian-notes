## Generative Model（生成式模型）
**Slides P2–3 | 历年：2021A Q1、2021B Q7、2023B Q1**
在一个 **Classification Problem（分类问题）** 中，我们有：
- $x$：Observation / Feature Vector（输入特征），例如花瓣长度和宽度。
- $y$：Class Label（类别标签），例如两种不同的花。
- **目标**：给定一个新的 $x$，预测它属于哪个 $y$。
**Generative Model** 的思想是先学习不同类别的数据是如何产生的，再进行分类。具体来说，它需要建立两个概率分布：
1. $p(y)$：**Prior Distribution（先验分布）**，某个类别出现的概率。
2. $p(x\mid y)$：**Class-Conditional Distribution（类条件分布，CCD）**，给定类别后，特征 $x$ 如何分布。
生成式分类器训练时主要学习 $p(y)$ 和 $p(x\mid y)$，然后利用 **Bayes' Rule** 得到 $p(y\mid x)$，再预测样本所属的类别。
**考试重点：**
- Generative Classifier 不直接学习 Decision Boundary，而是通过概率分布进行分类。
- 可以处理` Binary Classification 和 Multiclass Classification`。可以显式加入 Prior Knowledge。
- 不同的 Probability Distribution 假设可能带来不同的分类结果。
- 增加新的 Feature Dimension 后，需要重新学习模型，而不是直接使用原来的模型。
## Prior Probability（先验概率）
**Slides P3–4 | 历年：2021B Q6、2023B Q1**
**Prior Probability** 用 $p(y)$ 表示，代表在没有观察到具体特征 $x$ 之前，某个类别出现的概率。例如，假设某种花有两个类别：

$$
p(y=1)=0.4,\qquad p(y=2)=0.6
$$

表示 Class 1 占 40%，Class 2 占 60%。如果只有两个类别，可以使用 **Bernoulli Class Distribution** 建模：
$$
p(y=1)=\pi,\qquad p(y=2)=1-\pi， 
$$
其中 $\pi$ 是需要从 Training Data 中估计的参数。
**考试重点：Prior 会影响最终的分类结果。** 假设两个类别对某个样本具有相同的 Class-Conditional Density，但 Class 1 的 Prior 更大，那么 `Bayes Classifier `会选择 Class 1。
因此，历年题中的说法`The class probability p(y) does not affect the Bayesian classifier.` 答案是 **False**，因为最终分类结果同时取决于 Prior 和 CCD。
## Class-Conditional Distribution（CCD，类条件分布）
**Slides P5–6 | 历年：2023B Q1、2021B Q7**
**Class-Conditional Distribution (CCD)** 表示为：$p(x\mid y=c)$
- 已知一个样本属于 Class $c$，它的特征 $x$ 服从什么概率分布。
- 例如，在 slides 的 **Iris Classification** 中  $p(x\mid y=1),\quad p(x\mid y=2)$ 分别描述两类花的花瓣长度分布。不同类别可能具有不同的 Mean 和 Variance，因此它们的 CCD 也不同。
- Slides P6 展示了两类花的 Histogram，并指出 Histogram 可能比较 noisy，因此可以为每个 Class 假设一种概率分布，例如 **Gaussian Distribution**，再利用 Training Data 估计分布参数。
**考试重点：**
- CCD 描述的是每个 Class 自身的 Feature Distribution。
- 选择不同的 CCD Family，例如 Gaussian 或其他分布，会影响 Classifier Performance。
- CCD 可以帮助解释某类数据的 Typical / Prototypical Features。
- **CCD 不等于 Posterior Probability。** $\underbrace{p(x\mid y)}_{\text{CCD}} \neq \underbrace{p(y\mid x)}_{\text{Posterior}}$
## Maximum Likelihood Estimation
**Slides P4、P7–8**
**MLE** 负责从 Training Data 中估计模型参数，基本思想是：**选择一组参数，使观察到的 Training Data 的 Likelihood 最大。**
$$
\boxed{\theta^*=\arg\max_\theta\sum_{i=1}^{N}\log p(x_i\mid\theta)}
$$
这里的求和形式假设样本是独立采样的。Lecture 2a 主要介绍两种 MLE：
**A. Estimating Prior Probability**
假设有 $N_1$ 个 Class 1 样本，$N_2$ 个 Class 2 样本，那么：
$$
\boxed{\hat{\pi}=\frac{N_1}{N_1+N_2}}
$$
例如，100 个 Training Samples 中有 30 个属于 Class 1，那么：$\hat p(y=1)=\frac{30}{100}=0.3$
**B. Estimating Gaussian Parameters**
如果某一类别的特征服从 Gaussian Distribution，需要估计两个参数：
$$
\boxed{\hat\mu=\frac{1}{N}\sum_{i=1}^{N}x_i}
\boxed{\hat\sigma^2=\frac{1}{N}\sum_{i=1}^{N}(x_i-\hat\mu)^2}
$$
分别是 **Sample Mean** 和 **MLE Sample Variance**。注意，这里的方差分母是 $N$，不是无偏样本方差常用的 $N-1$。对于 Generative Classifier，每个 Class 需要单独估计自己的 Gaussian Parameters。
**考试重点：** 至少要记住 Prior、Mean 和 Variance 的 MLE 公式，并能够解释为什么要使用 MLE。

## Gaussian Bayes Classifier（高斯贝叶斯分类器）
**Slides P6–9 | 历年：2020 Q10**
Lecture 2a 使用 **Gaussian Distribution（正态分布）** 来建模 CCD：
$$
\boxed{
p(x\mid y=c)=
\frac{1}{\sqrt{2\pi\sigma_c^2}}
\exp\left(-\frac{(x-\mu_c)^2}{2\sigma_c^2}\right)
}
$$
每个 Class 都有自己的 $\mu_c$ 和 $\sigma_c^2$，需要理解两个参数的影响：
- **Mean $\mu$**：控制分布的中心位置。
- **Variance $\sigma^2$**：控制分布的分散程度，Variance 越大，曲线越宽、峰值通常越低。
如果两个 Class 的 Gaussian Distribution 存在 Overlap，说明某些 $x$ 在两个类别下都可能出现，因此 Classifier 无法保证始终预测正确。
**历年重点：2020 Q10** 考察了两个类别围绕相近中心分布的情况。原答案认为 Gaussian Bayes Classifier 会预测 $D$ 为 +1，因为 +1 类的 Prior 更大，而且两个类别的 Variance 也不同；Kernel SVM 则预测 -1。这说明两种模型采用不同的分类原则。注意：**仅凭某类的 Variance 更大不能决定最终预测，必须比较 CCD 与 Prior 的乘积。**

## Bayes' Rule & Bayesian Decision Rule
**Slides P9–12 | 历年：2021B Q6、2023B Q1、Mock Q1**
这是 **Lecture 2a 最重要的部分**。
`Bayes' Rule（贝叶斯公式）：`
$$
\boxed{p(y\mid x)=\frac{p(x\mid y)p(y)}{p(x)}}
$$

| 项 | 名称 | 含义 |
|---|---|---|
| $p(y)$ | Prior | 观察 $x$ 前，类别的概率 |
| $p(x\mid y)$ | Likelihood / CCD | 给定类别，观察到 $x$ 的密度或概率 |
| $p(x)$ | Evidence | 不区分类别，观察到 $x$ 的总体密度或概率 |
| $p(y\mid x)$ | Posterior | 观察 $x$ 后，类别的概率 |

- 分母 $p(x)=\sum_{c\in\mathcal Y}p(x\mid y=c)p(y=c)$ 的作用是 **Normalization（归一化）**，保证所有类别的 Posterior Probability 加起来等于 1。
- `Bayesian Decision Rule（BDR）` $\boxed{\hat y=\arg\max_c p(y=c\mid x)}$ 选择 Posterior Probability 最大的类别。During inference，这条规则能够 minimize the probability of classification error。
**计算例子：** 假设两个类别的 Prior 为：
$$
p(y=1)=0.2,\qquad p(y=2)=0.8
$$
对于一个新的样本 $x$：
$$
p(x\mid y=1)=0.6,\qquad p(x\mid y=2)=0.1
$$

首先计算 Joint Probability / Density：
$$
p(x,y=1)=0.6\times0.2=0.12
$$
$$
p(x,y=2)=0.1\times0.8=0.08
$$
然后计算 Posterior：
$$
p(y=1\mid x)=\frac{0.12}{0.12+0.08}=0.6
$$

$$
p(y=2\mid x)=\frac{0.08}{0.12+0.08}=0.4
$$
最终选择 **Class 1**，因为它的 Posterior 更大。
- **考试陷阱：** 虽然 Class 2 的 Prior 更高（0.8），但 Class 1 的 Posterior 更高（0.6），所以最终仍然应该选择 Class 1。不能只比较 Prior和 CCD，必须结合两者。

## Joint Likelihood、Decision Boundary & Log-Likelihood
**Slides P10–13**
因为对于同一个输入 $x$，Bayes' Rule 中的分母 $p(x)$ 对所有类别都相同，所以如果只需要预测类别，可以直接省略分母：
$$
\boxed{\hat y=\arg\max_c p(x\mid y=c)p(y=c)}
$$
- choose the class $c$ that maximizes the product of these two probabilities, and assign that class to the predicted label $\hat y$.
这里的乘积就是 **Joint Probability / Density**：
$$
p(x,y)=p(x\mid y)p(y)
$$
对于 Binary Classification，**Decision Boundary（决策边界）** 出现在两个类别的 Posterior 相等的位置  $p(y=1\mid x)=p(y=2\mid x)$
等价于  $\boxed{p(x\mid y=1)p(y=1)=p(x\mid y=2)p(y=2)}$
- 也可以使用 **Log-Likelihood** 来进行分类：
$$
\boxed{
\hat y=\arg\max_c
\left[\log p(x\mid y=c)+\log p(y=c)\right]
}
$$
- **Log 是 Monotonically Increasing Function（单调递增函数）**，因此不会改变哪个类别的分数最大。 **Log 把概率乘积变成加法**，对于非常小的概率值更加 Numerically Stable，可以减少数值下溢问题。
## Generative vs Discriminative Classifier
**历年：2021A Q1、2021B Q7、2023B Q1**

| 比较 | Generative Classifier | Discriminative Classifier |
|---|---|---|
| 学习什么 | $p(x\mid y)$、$p(y)$ | $p(y\mid x)$ 或直接学习分类边界 |
| 分类方式 | 通过 Bayes' Rule 计算 Posterior | 直接根据学到的模型分类 |
| 典型模型 | Gaussian Bayes、Naïve Bayes | Logistic Regression、SVM |
| 分布假设 | 需要假设 Feature Distribution 的形式 | 通常不需要显式建模 $p(x\mid y)$ |
| 可解释性 | CCD 描述各类别的典型特征 | 线性模型权重描述区分类别的重要特征 |

**Generative Model** 主要学习数据在不同类别下是如何产生的，因此可以利用 CCD 解释某个类别的 Typical Features；**Discriminative Model** 更关注如何根据输入 $x$ 区分不同类别，通常直接学习 Posterior 或 Decision Boundary。
**2021B Q7（10 marks）** 要求比较两类模型，并解释训练出的模型如何理解。标准答案还指出，Generative Model 在数据较少且分布假设适当的情况下可能有优势；Discriminative Model 不需要完整建模 Feature Distribution，通常更容易设置。但这不代表 Generative Model 在所有小数据问题上都一定更好。
考试可以记住的英文总结：`Generative classifiers model the joint distribution by learning the class prior and class-conditional distributions, then apply Bayes' rule for classification. Discriminative classifiers directly model the posterior probability or decision boundary without explicitly modeling how the input data is generated.`

## Naïve Bayes Assumption（朴素贝叶斯假设）
- Slides P1、P9 | 历年：2020 Q5、2021A Q2、Mock Q1
Lecture 2a 中，我们使用 Class-Conditional Distribution（CCD）$p(x\mid y)$ 描述某个类别下的特征分布。但之前主要考虑一个 Feature。如果现在有多个 Features，例如 $x=(x_1,x_2,\ldots,x_d)$，直接建模它们的 Joint Distribution 就会变得复杂。
- Naïve Bayes 的核心假设是：给定 Class Label $y$ 后，各个 Feature 之间相互独立（Conditionally Independent）。因此 $p(x\mid y)=\prod_{j=1}^{d}p(x_j\mid y)$
- 例如，对于两个 Features $p(x_1,x_2\mid y)=p(x_1\mid y)p(x_2\mid y)$
这样就不需要直接学习复杂的高维 Joint Distribution，而是分别学习每个 Feature 的一维 Probability Distribution。这个假设能够简化建模、减少需要估计的参数，在数据较少的情况下也可能取得不错的分类效果；但如果 Features 存在较强相关性，假设可能不准确，从而影响性能。
- 特别注意，Naïve Bayes 假设的是给定 Class Label `y` 后的 Conditional Independence，而不是说不同 Features 在整个数据集中无条件独立。
## Gaussian Naïve Bayes（高斯朴素贝叶斯）
- Slides P4–9 | 历年：Mock Q7、2023B Q8
Gaussian NB 在 Naïve Bayes 的基础上进一步假设：每个类别中的每个 Feature 都服从一个一维 Gaussian Distribution。例如，对于两个 Features：
$$
\boxed{
p(x\mid y=c)=
\mathcal N(x_1\mid\mu_{c,1},\sigma_{c,1}^2)
\mathcal N(x_2\mid\mu_{c,2},\sigma_{c,2}^2)
}
$$
每个 Class 的每个 Feature 都可以有自己的 Mean 和 Variance。因为 Features 条件独立，所以对应的 Covariance Matrix 是 Diagonal Matrix：
$$
\Sigma_c=
\begin{bmatrix}
\sigma_{c,1}^2 & 0\\
0 & \sigma_{c,2}^2
\end{bmatrix}
$$

非对角线元素为 0，表示模型没有考虑不同 Features 之间的 Covariance。
- Gaussian NB 的训练过程：先统计各类别的 Prior $p(y=c)$，再根据各类别的 Training Samples 估计每个 Feature 的 $\mu_{c,j}$ 和 $\sigma_{c,j}^2$，最后使用 Bayes' Rule 计算 Posterior 并进行分类。
考试重点：Mock Q7 直接要求写出 Gaussian NB 的模型假设、概率分布形式和分类规则，因此需要能够独立写出 Gaussian NB 的 CCD 公式。

## Multivariate Gaussian vs Gaussian Naïve Bayes
Slides P9–14 | 重点理解两者区别
- Naïve Bayes 假设 Features 条件独立，但真实数据中的 Features 可能存在 Correlation。例如 Iris Dataset 中，花瓣长度和其他花朵特征可能存在相关性，因此简单的条件独立假设不一定合理。
一种解决方式是使用 Multivariate Gaussian Distribution，直接建模 Feature 之间的 Covariance: $\boxed{p(x\mid y=c)=\mathcal N(x\mid\mu_c,\Sigma_c)}$
- 其中 $\mu_c$ 是 Mean Vector，$\Sigma_c$ 是 Covariance Matrix。对于两个 Features：
$$
\Sigma_c=
\begin{bmatrix}
\sigma_1^2 & \sigma_{12}\\
\sigma_{12} & \sigma_2^2
\end{bmatrix}
$$
非对角线的 $\sigma_{12}$ 表示两个 Features 之间的 Covariance。

| Covariance | 含义 | 图像特点 |
|---|---|---|
| $\sigma_{12}=0$ | 没有线性相关性 | Gaussian 椭圆与坐标轴对齐 |
| $\sigma_{12}>0$ | 正相关 | 椭圆向右上方倾斜 |
| $\sigma_{12}<0$ | 负相关 | 椭圆向右下方倾斜 |

对于 Multivariate Gaussian，零 Covariance 也意味着对应 Features 独立；但对于一般概率分布，零 Covariance 不一定意味着独立。
- Slides 中的 Iris 实验中，Full Gaussian 表现更好，因为它能够建模 Features 之间的 Correlation。但这不意味着 Full Gaussian 在任何数据集上都更好，因为它需要估计更多参数，数据不足时也可能 Overfit。
Slides P10–11 还介绍了 Covariance Matrix 的 MLE：
$$
\boxed{\hat\Sigma=\frac{1}{N}\sum_{i=1}^{N}(x_i-\hat\mu)(x_i-\hat\mu)^T}
$$
以及 Covariance Regularization：$\boxed{\Sigma\leftarrow\Sigma+\alpha I}$
- Regularization 通过增大对角线元素，防止 Covariance Matrix 退化，并改善 Numerical Stability。

## Bayesian Decision Rule in Naïve Bayes Assumption
- Slides P7–14 | 历年：2021B Q6、Mock Q1
Naïve Bayes 仍然使用 Lecture 2a 中的 Bayesian Decision Rule：
$$
\hat y=\arg\max_c p(y=c\mid x)
$$
区别是 Naïve Bayes 对 CCD 加入 Conditional Independence Assumption：
$$
p(x\mid y=c)=\prod_{j=1}^{d}p(x_j\mid y=c)
$$

因此，最终分类规则是：
$$
\boxed{\hat y=\arg\max_c p(y=c)\prod_{j=1}^{d}p(x_j\mid y=c)}
$$
也可以取 Log：
$$
\boxed{
\hat y=\arg\max_c\left[
\log p(y=c)+\sum_{j=1}^{d}\log p(x_j\mid y=c)
\right]
}
$$
- 这样，每个 Feature 的 Log-Likelihood 都会累加起来，作为分类时的 Evidence。
考试重点：
- Naïve Bayes 是 Bayesian Classifier 的一种具体实现。
- 训练时学习 Prior 和 CCD，而不是直接学习 Posterior。
- Naïve Bayes 可以处理 Multiclass Classification。
- Decision Boundary 不一定是 Linear。
- Bayesian Decision Rule 在真实概率模型已知时可以达到最小分类错误率；Naïve Bayes 只有在模型假设充分正确时才能达到相应的 Bayes 最优表现。

## Bag-of-Words & Bernoulli Naïve Bayes
- Slides P15、20–21 | 历年：2023B Q7
Spam Classification: 根据邮件内容判断它是不是 Spam。首先需要将 Text 转换成 Feature Vector。
A. Bag-of-Words（BoW）：假设 Vocabulary 为 $V=\{\text{free},\text{money},\text{meeting}\}$
邮件内容是 `"free money free"`，那么对应的 Count Vector 为 $x=[2,1,0]$
- Bag-of-Words 只统计每个词出现的次数，不考虑 Word Order，因此 `"free money"` 和 `"money free"` 的 BoW 表示相同。
B. Bernoulli Naïve Bayes：Bernoulli NB 不关心一个词出现多少次，只关心它是否出现，因此 $x_j\in\{0,1\}$. 
- 对于 Class $c$，每个 Word 的出现与否服从 Bernoulli Distribution, $p(x_j=1\mid y=c)=\pi_{j,c}$, $p(x_j=0\mid y=c)=1-\pi_{j,c}$
使用 MLE 估计：
$$
\boxed{\hat\pi_{j,c}=\frac{N_{j,c}}{N_c}}
$$
其中 $N_{j,c}$ 表示 Class $c$ 中包含 Word $j$ 的文档数量，$N_c$ 表示该类别的文档总数量。最终仍然利用 Naïve Bayes 将各个词的概率相乘，再结合 Prior 预测邮件类别。

## Laplace Smoothing（拉普拉斯平滑）
- Slides P25–26 | 历年：2020 Q5、2023B Q7
这是一个很容易考的知识点。假设 Training Data 中，Spam 类别只有 20 封邮件，而且没有任何一封包含 `"university"`，那么不使用 Smoothing 时：
$$
p(\text{university}=1\mid\text{spam})=0
$$
- 如果新邮件包含这个词，Bernoulli NB 计算 Spam 的 Joint Likelihood 时就会出现乘以 0 的问题，导致整个概率乘积变成 0。
解决方式是 Laplace Smoothing，即在估计概率时加入 Virtual Count。Slides 中 Bernoulli NB 的公式为：
$$
\boxed{\hat\pi_{j,c}=\frac{N_{j,c}+\alpha}{N_c+2\alpha}}
$$
其中 $\alpha>0$ 是 Smoothing Parameter。它可以避免模型仅仅因为某个词没有在训练样本中出现，就把该词在某个 Class 中出现的概率估计为 0。
主要作用：
- Avoid Zero Probability。
- Reduce Overfitting caused by limited training data。
- Improve Generalization，尤其是在训练样本较少时。
Slides P25 的实验中，加入 Smoothing 后，Bernoulli NB 的 Test Accuracy 从 64% 提高到了 72%。但这种性能改进并不能保证在所有数据集上都成立。

## Multinomial Naïve Bayes、TF、TF-IDF
- Slides P27–29 | 历年：2023B Q7
A. Multinomial Naïve Bayes：与 Bernoulli NB 最大的区别是，Bernoulli NB 只关心 Word 是否出现，而 Multinomial NB 会考虑 Word 出现的次数。
Multinomial NB 根据词的出现频率，估计每个词的概率 $\pi_{j,c}$，并满足$\sum_j\pi_{j,c}=1$
对于 Word Count $n_j$，分类时使用：
$$
p(x\mid y=c)\propto\prod_j\pi_{j,c}^{n_j}
$$


B. Term Frequency（TF）：TF 用来处理不同长度的文档，计算某个 Word 在一篇文档中出现的相对频率
$$
\boxed{\mathrm{TF}(j,D)=\frac{n_j}{|D|}}
$$
其中 $n_j$ 是 Word $j$ 出现的次数，$|D|$ 是文档的总词数。

C. TF-IDF：某些词在几乎所有文档中都很常见，因此没有很强的区分能力。IDF 用来衡量一个词在整个 Document Collection 中有多罕见：
$$
\mathrm{IDF}(j)=\log\frac{N}{N_j}
$$
其中 $N$ 是 Document 总数，$N_j$ 是包含 Word $j$ 的 Document 数量。最终：
$$
\boxed{
\mathrm{TF\!-\!IDF}(j,D)=
\frac{n_j}{|D|}\log\frac{N}{N_j}
}
$$

考试需要理解：Word 在某篇文档中出现得越频繁，TF 越高；Word 在整个语料库中越罕见，IDF 越高。TF-IDF 通过降低普遍出现的词的权重、提高相对罕见词的权重，来衡量词的重要程度。

## Naïve Bayes vs Logistic Regression（历年重点）
- 历年：2021A Q8、2023B Q8 | 跨 Lecture 2b / 3a
2023B Q8 要求列出两种模型至少五个相同点和不同点，因此需要重点掌握下面的比较

| 比较方面 | Naïve Bayes | Logistic Regression |
|---|---|---|
| 模型类别 | Generative | Discriminative |
| 学习目标 | CCD 和 Prior | Conditional Probability / Logistic Loss |
| 使用 MLE | 可以 | 可以 |
| 分布假设 | 需要，例如 Gaussian | 不需要建模 Feature Distribution |
| 参数 | Class Prior、Mean、Variance 等 | Weights $w$、Bias $b$ |
| Decision Boundary | 可能 Linear，也可能 Nonlinear | 标准 Logistic Regression 对原始 Features 为 Linear |

一个特别重要的历年考点是：Gaussian NB 和 Logistic Regression 都可能是 Linear Classifier。当 Gaussian NB 的不同 Classes 共享相同的 Feature Variance 时，比较两个类别的 Log-Posterior，二次项会抵消，最终得到线性形式：
$$
\boxed{w^Tx+b}
$$
但如果不同 Classes 的 Variance 不同，Gaussian NB 的 Decision Boundary 可以是 Nonlinear。

2023B Q8 的参考答案还比较了两种模型的参数数量。需要注意，Gaussian NB 的实际参数数量取决于 Variance 是否在 Class 或 Feature 之间共享，不能脱离具体假设机械记忆固定数字。